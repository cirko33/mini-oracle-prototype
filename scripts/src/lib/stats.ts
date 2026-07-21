// Median of a numeric list. Returns null for an empty list. Does not mutate
// the input.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Median Absolute Deviation about the median. Returns null for an empty list.
export function mad(values: number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  const deviations = values.map((v) => Math.abs(v - m));
  return median(deviations);
}

// Modified z-scores (Iglewicz & Hoaglin) for each value:
//   z_i = 0.6745 * (x_i - median) / MAD
// MAD can be 0 even when the values differ (a tie-heavy cluster, e.g. a
// majority of identical prints). Iglewicz & Hoaglin's fallback for that case
// is the mean absolute deviation:
//   z_i = (x_i - median) / (1.253314 * MeanAD)
// If there is genuinely no spread at all, every score is 0.
export function modifiedZScores(values: number[]): number[] {
  const m = median(values);
  if (m === null) return values.map(() => 0);
  const deviations = values.map((v) => Math.abs(v - m));
  const d = median(deviations)!;
  if (d > 0) return values.map((v) => (0.6745 * (v - m)) / d);
  const meanAd = deviations.reduce((s, x) => s + x, 0) / values.length;
  if (meanAd > 0) return values.map((v) => (v - m) / (1.253314 * meanAd));
  return values.map(() => 0);
}

// Volume-weighted average price. Pairs with non-positive weight are ignored.
// Returns null when there is no positive weight.
export function vwap(points: { price: number; volume: number }[]): number | null {
  let num = 0;
  let den = 0;
  for (const { price, volume } of points) {
    if (volume > 0) {
      num += price * volume;
      den += volume;
    }
  }
  return den > 0 ? num / den : null;
}
