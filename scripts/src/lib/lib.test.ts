import { test, expect, describe } from "bun:test";
import { parseLine, parseNdjson, venueKeys } from "./parse.ts";
import { median, mad, modifiedZScores, vwap } from "./stats.ts";
import {
  usdtUsdIndex,
  makeUsdtUsdIndexLookup,
  normalizeUsdPrice,
  usdNotionalVolume,
} from "./normalize.ts";
import { runSnapshot, vwapSeries, DEFAULT_PARAMS } from "./pipeline.ts";
import type { FilterParams, Snapshot } from "./types.ts";

// A real-shaped line with `ts` mid-object and a null venue, like line 27 of the feed.
const REAL_LINE =
  '{"binance":{"price":null,"volume":null},"coinbase":{"price":0.853,"volume":1523965.46},"digifinex":{"price":0.8532,"volume":1529564.51},"ts":1784652102185,"weex":{"price":0.85,"volume":68088.5}}';

describe("parse", () => {
  test("parses a line with mid-object ts and null venue", () => {
    const s = parseLine(REAL_LINE)!;
    expect(s.ts).toBe(1784652102185);
    expect(s.venues.binance).toEqual({ price: null, volume: null });
    expect(s.venues.coinbase).toEqual({ price: 0.853, volume: 1523965.46 });
    expect(Object.keys(s.venues)).not.toContain("ts");
  });

  test("drops blank and unparseable lines, sorts by ts", () => {
    const text = [
      '{"a":{"price":1,"volume":1},"ts":200}',
      "",
      "not json",
      '{"a":{"price":1,"volume":1},"ts":100}',
    ].join("\n");
    const snaps = parseNdjson(text);
    expect(snaps.map((s) => s.ts)).toEqual([100, 200]);
  });

  test("rejects a line without numeric ts", () => {
    expect(parseLine('{"a":{"price":1,"volume":1}}')).toBeNull();
  });

  test("venueKeys is the sorted union", () => {
    const snaps = parseNdjson(
      [
        '{"b":{"price":1,"volume":1},"ts":1}',
        '{"a":{"price":1,"volume":1},"ts":2}',
      ].join("\n"),
    );
    expect(venueKeys(snaps)).toEqual(["a", "b"]);
  });
});

describe("stats", () => {
  test("median odd/even/empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test("mad", () => {
    // values 1,1,2,2,4,6,9 -> median 2; |dev| 1,1,0,0,2,4,7 -> median 1
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });

  test("modifiedZScores are zero when MAD is zero", () => {
    expect(modifiedZScores([5, 5, 5])).toEqual([0, 0, 0]);
  });

  test("modifiedZScores flag a clear outlier", () => {
    const z = modifiedZScores([1, 1, 1, 1, 10]);
    expect(Math.abs(z[4]!)).toBeGreaterThan(3.5);
  });

  test("vwap weights by volume, ignores non-positive weight", () => {
    // (1*1 + 3*3) / (1+3) = 10/4 = 2.5
    expect(
      vwap([
        { price: 1, volume: 1 },
        { price: 3, volume: 3 },
        { price: 99, volume: 0 },
      ]),
    ).toBe(2.5);
    expect(vwap([])).toBeNull();
  });
});

describe("normalize", () => {
  test("usdtUsdIndex is the volume-weighted stablecoin price", () => {
    const snap: Snapshot = {
      ts: 1,
      venues: {
        a: { price: 1.0, volume: 3 },
        b: { price: 0.998, volume: 1 },
      },
    };
    // (1.0*3 + 0.998*1) / 4 = 0.9995
    expect(usdtUsdIndex(snap)).toBeCloseTo(0.9995, 6);
  });

  test("normalizeUsdPrice leaves USD-set venues untouched, scales the rest", () => {
    expect(normalizeUsdPrice("coinbase", 0.85, 0.999)).toBe(0.85);
    expect(normalizeUsdPrice("crypto.com", 0.85, 0.999)).toBe(0.85);
    expect(normalizeUsdPrice("binance", 0.85, 0.5)).toBeCloseTo(0.425, 6);
  });

  test("usdNotionalVolume converts only digifinex", () => {
    expect(usdNotionalVolume("binance", 100, 0.85)).toBe(100);
    expect(usdNotionalVolume("digifinex", 100, 0.85)).toBe(85);
  });

  test("index lookup uses exact ts then nearest", () => {
    const lookup = makeUsdtUsdIndexLookup([
      { ts: 100, venues: { a: { price: 1.0, volume: 1 } } },
      { ts: 200, venues: { a: { price: 0.99, volume: 1 } } },
    ]);
    expect(lookup(100)).toBeCloseTo(1.0, 6);
    expect(lookup(210)).toBeCloseTo(0.99, 6); // nearest is 200
  });
});

describe("pipeline", () => {
  const iso = (over: Partial<FilterParams>): FilterParams => ({
    stalenessWindowMs: 0,
    minVolumeShare: 0,
    madThreshold: 0,
    ...over,
  });
  // Flat USDT index of 1.0 so normalization is a no-op for these fixtures.
  const usdFeed: Snapshot[] = [{ ts: 200, venues: { x: { price: 1, volume: 1 } } }];

  test("null venue -> no-data and excluded from VWAP", () => {
    const dot: Snapshot[] = [
      {
        ts: 200,
        venues: {
          a: { price: 1.0, volume: 100 },
          b: { price: 1.0, volume: 100 },
          bad: { price: null, volume: null },
        },
      },
    ];
    const r = runSnapshot(dot, 0, iso({}), makeUsdtUsdIndexLookup(usdFeed));
    const bad = r.venues.find((v) => v.venue === "bad")!;
    expect(bad.status).toBe("no-data");
    expect(r.vwap).toBeCloseTo(1.0, 6);
    expect(r.survivorCount).toBe(2);
    expect(r.venueCount).toBe(2);
  });

  test("MAD removes an outlier and VWAP reflects survivors", () => {
    const dot: Snapshot[] = [
      {
        ts: 200,
        venues: {
          a: { price: 1.0, volume: 100 },
          b: { price: 1.0, volume: 100 },
          c: { price: 1.0, volume: 100 },
          d: { price: 1.0, volume: 100 },
          out: { price: 2.0, volume: 100 },
        },
      },
    ];
    const r = runSnapshot(dot, 0, iso({ madThreshold: 3.5 }), makeUsdtUsdIndexLookup(usdFeed));
    expect(r.venues.find((v) => v.venue === "out")!.status).toBe("mad-outlier");
    expect(r.vwap).toBeCloseTo(1.0, 6); // outlier excluded
    expect(r.survivorCount).toBe(4);
  });

  test("relative volume filter drops a thin venue", () => {
    const dot: Snapshot[] = [
      {
        ts: 200,
        venues: {
          big: { price: 1.0, volume: 1_000_000 },
          mid: { price: 1.0, volume: 1_000_000 },
          thin: { price: 1.0, volume: 10 }, // ~0.0005% of total
        },
      },
    ];
    const r = runSnapshot(dot, 0, iso({ minVolumeShare: 0.01 }), makeUsdtUsdIndexLookup(usdFeed));
    expect(r.venues.find((v) => v.venue === "thin")!.status).toBe("low-volume");
    expect(r.survivorCount).toBe(2);
  });

  test("digifinex volume is converted to USD-notional before weighting", () => {
    const dot: Snapshot[] = [
      {
        ts: 200,
        venues: {
          digifinex: { price: 2.0, volume: 50 }, // base DOT -> 100 USD-notional
        },
      },
    ];
    const r = runSnapshot(dot, 0, iso({}), makeUsdtUsdIndexLookup(usdFeed));
    expect(r.venues.find((v) => v.venue === "digifinex")!.usdVolume).toBe(100);
  });

  test("staleness is undecidable without full window coverage", () => {
    const dot: Snapshot[] = [
      { ts: 100, venues: { a: { price: 1, volume: 1 } } },
      { ts: 200, venues: { a: { price: 1, volume: 1 } } },
    ];
    // window 30min reaches far before the first tick
    const r = runSnapshot(dot, 1, iso({ stalenessWindowMs: 1_800_000 }), makeUsdtUsdIndexLookup(usdFeed));
    expect(r.stalenessUndecidable).toBe(true);
    expect(r.venues.find((v) => v.venue === "a")!.status).toBe("survivor");
  });

  test("staleness flags a flat feed when the window is covered", () => {
    const dot: Snapshot[] = [
      { ts: 0, venues: { flat: { price: 1, volume: 1 }, moving: { price: 1, volume: 1 } } },
      { ts: 100, venues: { flat: { price: 1, volume: 1 }, moving: { price: 1.1, volume: 1 } } },
      { ts: 200, venues: { flat: { price: 1, volume: 1 }, moving: { price: 1.2, volume: 1 } } },
    ];
    const r = runSnapshot(dot, 2, iso({ stalenessWindowMs: 150 }), makeUsdtUsdIndexLookup(usdFeed));
    expect(r.stalenessUndecidable).toBe(false);
    expect(r.venues.find((v) => v.venue === "flat")!.status).toBe("stale");
    expect(r.venues.find((v) => v.venue === "moving")!.status).toBe("survivor");
  });

  test("vwapSeries returns one point per tick", () => {
    const dot: Snapshot[] = [
      { ts: 100, venues: { a: { price: 1, volume: 1 } } },
      { ts: 200, venues: { a: { price: 2, volume: 1 } } },
    ];
    const series = vwapSeries(dot, DEFAULT_PARAMS, usdFeed);
    expect(series.map((p) => p.ts)).toEqual([100, 200]);
    expect(series[1]!.vwap).toBeCloseTo(2, 6);
  });
});
