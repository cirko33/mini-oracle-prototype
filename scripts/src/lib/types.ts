// A single venue quote as it appears in the NDJSON feeds. Either field can be
// null when the poller failed to fetch/parse that venue on a given tick.
export interface VenueQuote {
  price: number | null;
  volume: number | null;
}

// One NDJSON line: a set of venue quotes stamped with a shared epoch-ms `ts`.
export interface Snapshot {
  ts: number;
  venues: Record<string, VenueQuote>;
}

// Why a venue did or didn't make it into the final VWAP for a given tick.
export type VenueStatus =
  | "survivor"
  | "no-data" // price or volume was null
  | "stale" // raw price unchanged across the staleness window
  | "low-volume" // USD-notional volume share below threshold
  | "mad-outlier"; // modified z-score above the MAD threshold

// Filter knobs driven by the UI sliders.
export interface FilterParams {
  // Staleness lookback window, in milliseconds. 0 disables the filter.
  stalenessWindowMs: number;
  // Minimum share of total USD-notional volume, as a fraction 0..1.
  minVolumeShare: number;
  // Modified z-score threshold for the MAD outlier filter. 0 disables it.
  madThreshold: number;
}

// Per-venue outcome of running the pipeline on one tick.
export interface VenueResult {
  venue: string;
  status: VenueStatus;
  rawPrice: number | null; // price in the venue's own quote currency
  usdPrice: number | null; // normalized to USD
  usdVolume: number | null; // 24h volume, USD-notional
  volumeShare: number | null; // usdVolume / total (of staleness survivors)
  modZScore: number | null; // MAD modified z-score (null if not evaluated)
}

// Full result of the pipeline for one tick.
export interface PipelineResult {
  ts: number;
  usdtUsdIndex: number; // stablecoin index applied to USDT-quoted venues
  vwap: number | null; // volume-weighted average of survivors, USD
  survivorCount: number;
  venueCount: number; // venues with usable data this tick
  venues: VenueResult[];
  // True when the tick lacks enough history to evaluate the staleness window.
  stalenessUndecidable: boolean;
}
