import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VwapPoint } from "../lib/pipeline.ts";
import type { ChartColors } from "../theme.ts";
import { fmtPrice, fmtTime } from "../format.ts";

export interface Overlay {
  id: string;
  label: string;
  color: string;
  points: VwapPoint[];
  avgSurvivors: number;
}

function CustomTooltip({ active, payload, label, colors }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12.5,
        color: "var(--ink)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{fmtTime(label)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: "var(--ink-secondary)" }}>
          <span style={{ color: p.stroke, fontWeight: 700 }}>●</span>{" "}
          {p.name}: <b>{p.value === null ? "—" : `$${fmtPrice(p.value)}`}</b>
        </div>
      ))}
    </div>
  );
}

export function VwapChart({
  live,
  overlays,
  colors,
  onRemove,
  showLive,
}: {
  live: VwapPoint[];
  overlays: Overlay[];
  colors: ChartColors;
  onRemove: (id: string) => void;
  showLive: boolean;
}) {
  // All series share the same tick sequence, so we merge by index.
  const data = live.map((p, i) => {
    const row: Record<string, number | null> = { ts: p.ts, live: p.vwap };
    for (const ov of overlays) row[ov.id] = ov.points[i]?.vwap ?? null;
    return row;
  });

  const all: number[] = [];
  if (showLive) for (const p of live) if (p.vwap !== null) all.push(p.vwap);
  for (const ov of overlays)
    for (const p of ov.points) if (p.vwap !== null) all.push(p.vwap);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo) * 0.25 || hi * 0.002 || 0.01;

  return (
    <div className="card">
      <h2>VWAP over time</h2>
      <p className="card-note">
        The oracle price across every tick for the current filters (the neutral
        line). In static mode, freeze a config as a colored curve to compare.
      </p>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320} minWidth={640}>
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 8 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={fmtTime}
              tick={{ fill: colors.muted, fontSize: 11 }}
              stroke={colors.axis}
              minTickGap={40}
            />
            <YAxis
              domain={[lo - pad, hi + pad]}
              tickFormatter={(v) => fmtPrice(v, 4)}
              tick={{ fill: colors.muted, fontSize: 11 }}
              stroke={colors.axis}
              width={62}
            />
            <Tooltip
              content={<CustomTooltip colors={colors} />}
              cursor={{ stroke: colors.axis, strokeWidth: 1 }}
            />
            {overlays.map((ov) => (
              <Line
                key={ov.id}
                dataKey={ov.id}
                name={ov.label}
                stroke={ov.color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {showLive && (
              <Line
                dataKey="live"
                name="Live (current filters)"
                stroke={colors.ink}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="legend">
        {showLive && (
          <span className="item">
            <span className="dot" style={{ background: colors.ink }} />
            Live (current filters)
          </span>
        )}
        {!showLive && overlays.length === 0 && (
          <span className="item">
            Current curve hidden — plot a config or show it again.
          </span>
        )}
      </div>

      {overlays.length > 0 && (
        <div className="overlay-list">
          {overlays.map((ov) => (
            <div className="row" key={ov.id}>
              <span className="dot" style={{ background: ov.color }} />
              <span>{ov.label}</span>
              <span className="meta">~{ov.avgSurvivors.toFixed(1)} survivors avg</span>
              <button
                className="btn"
                style={{ padding: "1px 8px", marginLeft: "auto" }}
                onClick={() => onRemove(ov.id)}
                aria-label={`remove ${ov.label}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
