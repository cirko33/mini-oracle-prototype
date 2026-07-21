import type {
  FilterParams,
  PipelineResult,
  Snapshot,
  VenueResult,
  VenueStatus,
} from "./types.ts";
import {
  makeUsdtUsdIndexLookup,
  normalizeUsdPrice,
  usdNotionalVolume,
} from "./normalize.ts";
import { modifiedZScores, vwap } from "./stats.ts";

export const DEFAULT_PARAMS: FilterParams = {
  stalenessWindowMs: 30 * 60 * 1000, // 30 min
  minVolumeShare: 0.01, // 1%
  madThreshold: 3.5,
};

// Working row for a single venue as it moves through the pipeline.
interface Row {
  venue: string;
  rawPrice: number | null;
  usdPrice: number | null;
  usdVolume: number | null;
  volumeShare: number | null;
  modZScore: number | null;
  status: VenueStatus;
}

// Is a venue's raw price flat across the staleness window? Requires at least
// two sampled ticks; a single sample can't establish "unchanged".
function isStale(
  venue: string,
  windowSnaps: Snapshot[],
): boolean {
  const prices: number[] = [];
  for (const s of windowSnaps) {
    const q = s.venues[venue];
    if (q && q.price !== null) prices.push(q.price);
  }
  if (prices.length < 2) return false;
  return prices.every((p) => p === prices[0]);
}

// Run the full oracle pipeline on the tick at `index` within the sorted
// `dotSnapshots`, using the given filter params and USDT/USD index lookup.
export function runSnapshot(
  dotSnapshots: Snapshot[],
  index: number,
  params: FilterParams,
  indexLookup: (ts: number) => number,
): PipelineResult {
  const current = dotSnapshots[index]!;
  const ts = current.ts;
  const usdtUsd = indexLookup(ts);

  // Step 1-3: guard nulls, normalize price, convert volume to USD-notional.
  const rows: Row[] = [];
  for (const [venue, q] of Object.entries(current.venues)) {
    if (q.price === null || q.volume === null) {
      rows.push({
        venue,
        rawPrice: q.price,
        usdPrice: null,
        usdVolume: null,
        volumeShare: null,
        modZScore: null,
        status: "no-data",
      });
      continue;
    }
    const usdPrice = normalizeUsdPrice(venue, q.price, usdtUsd);
    const usdVolume = usdNotionalVolume(venue, q.volume, usdPrice);
    rows.push({
      venue,
      rawPrice: q.price,
      usdPrice,
      usdVolume,
      volumeShare: null,
      modZScore: null,
      status: "survivor",
    });
  }

  // Step 4: staleness. Only evaluable when the window is fully covered by data.
  let stalenessUndecidable = false;
  if (params.stalenessWindowMs > 0) {
    const windowStart = ts - params.stalenessWindowMs;
    const covered =
      dotSnapshots.length > 0 && dotSnapshots[0]!.ts <= windowStart;
    if (!covered) {
      stalenessUndecidable = true;
    } else {
      const windowSnaps = dotSnapshots.filter(
        (s) => s.ts >= windowStart && s.ts <= ts,
      );
      for (const row of rows) {
        if (row.status !== "survivor") continue;
        if (isStale(row.venue, windowSnaps)) row.status = "stale";
      }
    }
  }

  // Step 5: relative volume share, computed against staleness survivors.
  const volSurvivors = rows.filter((r) => r.status === "survivor");
  const totalVol = volSurvivors.reduce((sum, r) => sum + (r.usdVolume ?? 0), 0);
  for (const row of volSurvivors) {
    const share = totalVol > 0 ? (row.usdVolume ?? 0) / totalVol : 0;
    row.volumeShare = share;
    if (share < params.minVolumeShare) row.status = "low-volume";
  }

  // Step 6: MAD outlier removal on the remaining survivors' USD prices.
  const madSurvivors = rows.filter((r) => r.status === "survivor");
  const prices = madSurvivors.map((r) => r.usdPrice!);
  const zScores = modifiedZScores(prices);
  madSurvivors.forEach((row, i) => {
    const z = zScores[i]!;
    row.modZScore = z;
    if (params.madThreshold > 0 && Math.abs(z) > params.madThreshold) {
      row.status = "mad-outlier";
    }
  });

  // Step 7: VWAP over final survivors.
  const finalSurvivors = rows.filter((r) => r.status === "survivor");
  const price = vwap(
    finalSurvivors.map((r) => ({ price: r.usdPrice!, volume: r.usdVolume! })),
  );

  const venues: VenueResult[] = rows.map((r) => ({
    venue: r.venue,
    status: r.status,
    rawPrice: r.rawPrice,
    usdPrice: r.usdPrice,
    usdVolume: r.usdVolume,
    volumeShare: r.volumeShare,
    modZScore: r.modZScore,
  }));

  return {
    ts,
    usdtUsdIndex: usdtUsd,
    vwap: price,
    survivorCount: finalSurvivors.length,
    venueCount: rows.filter((r) => r.status !== "no-data").length,
    venues,
    stalenessUndecidable,
  };
}

export interface VwapPoint {
  ts: number;
  vwap: number | null;
  survivorCount: number;
}

// Compute the VWAP(t) series across every tick for a given filter config.
export function vwapSeries(
  dotSnapshots: Snapshot[],
  params: FilterParams,
  usdSnapshots: Snapshot[],
): VwapPoint[] {
  const lookup = makeUsdtUsdIndexLookup(usdSnapshots);
  return dotSnapshots.map((_, i) => {
    const r = runSnapshot(dotSnapshots, i, params, lookup);
    return { ts: r.ts, vwap: r.vwap, survivorCount: r.survivorCount };
  });
}
