import type { PipelineResult, VenueStatus } from "../lib/types.ts";
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from "../theme.ts";
import { fmtPrice, fmtTime, fmtPct, fmtUsd } from "../format.ts";

const rank = (s: VenueStatus) => STATUS_ORDER.indexOf(s);

// The breakdown of a single selected tick: how many venues cleared the current
// filters, and for each venue what it contributed (price / volume weight) or
// which filter cut it.
export function BreakdownPanel({
  result,
  onClose,
}: {
  result: PipelineResult;
  onClose: () => void;
}) {
  // Survivors first, then rejected in filter order; within a group by volume
  // weight so the biggest contributors / offenders sit on top.
  const venues = [...result.venues].sort((a, b) => {
    if (a.status !== b.status) return rank(a.status) - rank(b.status);
    return (b.volumeShare ?? 0) - (a.volumeShare ?? 0);
  });

  // Tally of why venues were dropped (ignoring no-data, which never had a price).
  const tally = new Map<VenueStatus, number>();
  for (const v of result.venues) {
    if (v.status === "survivor" || v.status === "no-data") continue;
    tally.set(v.status, (tally.get(v.status) ?? 0) + 1);
  }
  const reasons = STATUS_ORDER.filter(
    (s) => s !== "survivor" && s !== "no-data" && tally.has(s),
  )
    .map((s) => `${tally.get(s)} ${STATUS_LABELS[s].toLowerCase()}`)
    .join(" · ");

  return (
    <div className="card breakdown">
      <div className="breakdown-head">
        <div>
          <h2>Tick at {fmtTime(result.ts)}</h2>
          <p className="card-note" style={{ margin: 0 }}>
            <b>
              {result.survivorCount} of {result.venueCount}
            </b>{" "}
            venues cleared the current filters
            {reasons ? ` — rejected: ${reasons}` : ""}. VWAP{" "}
            <b>
              {result.vwap === null ? "—" : `$${fmtPrice(result.vwap, 5)}`}
            </b>
            .
          </p>
        </div>
        <button className="btn" onClick={onClose} aria-label="close breakdown">
          ✕
        </button>
      </div>

      <div className="venue-table">
        <div className="vt-head">
          <span>Venue</span>
          <span>Status</span>
          <span className="num">USD price</span>
          <span className="num">USD volume</span>
          <span className="num">Vol share</span>
          <span className="num">z-score</span>
        </div>
        {venues.map((v) => (
          <div className="vt-row" key={v.venue}>
            <span className="vt-venue">{v.venue}</span>
            <span className="vt-status">
              <span
                className="badge-dot"
                style={{ background: STATUS_COLORS[v.status] }}
              />
              {STATUS_LABELS[v.status]}
            </span>
            <span className="num">
              {v.usdPrice === null ? "—" : `$${fmtPrice(v.usdPrice, 5)}`}
            </span>
            <span className="num">{fmtUsd(v.usdVolume)}</span>
            <span className="num">{fmtPct(v.volumeShare, 1)}</span>
            <span className="num">
              {v.modZScore === null ? "—" : v.modZScore.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
