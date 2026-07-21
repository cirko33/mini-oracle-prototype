import type { PipelineResult } from "../lib/types.ts";
import { fmtPrice, fmtTime, fmtPct } from "../format.ts";

export function StatsPanel({ result }: { result: PipelineResult }) {
  return (
    <div className="stats">
      <div className="stat">
        <span className="label">VWAP (USD)</span>
        <span className="value tabular">
          {result.vwap === null ? "—" : `$${fmtPrice(result.vwap, 5)}`}
        </span>
      </div>
      <div className="stat">
        <span className="label">Survivors</span>
        <span className="value tabular">
          {result.survivorCount}
          <span className="unit">/ {result.venueCount} with data</span>
        </span>
      </div>
      <div className="stat">
        <span className="label">USDT / USD index</span>
        <span className="value tabular">{fmtPrice(result.usdtUsdIndex, 5)}</span>
      </div>
      <div className="stat">
        <span className="label">Latest tick</span>
        <span className="value tabular">{fmtTime(result.ts)}</span>
      </div>
      <div className="stat">
        <span className="label">Rejected</span>
        <span className="value tabular">
          {fmtPct(
            result.venueCount === 0
              ? 0
              : 1 - result.survivorCount / result.venueCount,
            0,
          )}
        </span>
      </div>
    </div>
  );
}
