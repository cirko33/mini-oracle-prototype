// Small display helpers. Kept dependency-free and pure.

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function fmtPrice(v: number | null, digits = 5): string {
  return v === null ? "—" : v.toFixed(digits);
}

// Compact USD volume: $6.19M, $337.8K, $42.
export function fmtUsd(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function fmtPct(frac: number | null, digits = 2): string {
  return frac === null ? "—" : `${(frac * 100).toFixed(digits)}%`;
}

// A staleness window in ms as a human duration: "off", "30 min", "2 h".
export function fmtDuration(ms: number): string {
  if (ms <= 0) return "off";
  const min = ms / 60000;
  if (min < 60) return `${min % 1 === 0 ? min : min.toFixed(0)} min`;
  const h = min / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)} h`;
}
