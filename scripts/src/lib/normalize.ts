import type { Snapshot } from "./types.ts";
import { median, vwap } from "./stats.ts";

// Venues that quote DOT directly in fiat USD — left untouched by normalization.
// crypto.com is queried by the poller as DOT_USD, so it belongs here too.
export const USD_SET = new Set(["coinbase", "kraken", "crypto.com"]);

// Venue whose reported volume is base (DOT) rather than USD-notional.
export const DIGIFINEX = "digifinex";

// The USDT/USD index for one usdprice snapshot: VWAP of its venues' stablecoin
// prices weighted by volume. Falls back to the median price, then to 1.0, so a
// thin or empty tick never produces a garbage multiplier.
export function usdtUsdIndex(snapshot: Snapshot): number {
  const points: { price: number; volume: number }[] = [];
  const prices: number[] = [];
  for (const q of Object.values(snapshot.venues)) {
    if (q.price === null || q.price <= 0) continue;
    prices.push(q.price);
    if (q.volume !== null && q.volume > 0) {
      points.push({ price: q.price, volume: q.volume });
    }
  }
  const weighted = vwap(points);
  if (weighted !== null) return weighted;
  const mid = median(prices);
  return mid !== null && mid > 0 ? mid : 1;
}

// Build a fast ts -> index lookup from the usdprice feed. Exact ts match when
// available (the two feeds are stamped tick-for-tick); otherwise the nearest
// tick by time; 1.0 when the feed is empty.
export function makeUsdtUsdIndexLookup(
  usdSnapshots: Snapshot[],
): (ts: number) => number {
  const entries = usdSnapshots
    .map((s) => ({ ts: s.ts, index: usdtUsdIndex(s) }))
    .sort((a, b) => a.ts - b.ts);
  const exact = new Map(entries.map((e) => [e.ts, e.index]));

  return (ts: number): number => {
    if (entries.length === 0) return 1;
    const hit = exact.get(ts);
    if (hit !== undefined) return hit;
    // Nearest by absolute time distance.
    let best = entries[0]!;
    let bestDist = Math.abs(best.ts - ts);
    for (const e of entries) {
      const dist = Math.abs(e.ts - ts);
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    return best.index;
  };
}

// DOT price in USD. USD-set venues are already USD; USDT-quoted venues are
// scaled by the stablecoin index.
export function normalizeUsdPrice(
  venue: string,
  rawPrice: number,
  index: number,
): number {
  return USD_SET.has(venue) ? rawPrice : rawPrice * index;
}

// 24h volume expressed as USD-notional. Every venue is already USD-notional
// except digifinex, whose base (DOT) volume is converted via the USD price.
export function usdNotionalVolume(
  venue: string,
  rawVolume: number,
  usdPrice: number,
): number {
  return venue === DIGIFINEX ? rawVolume * usdPrice : rawVolume;
}
