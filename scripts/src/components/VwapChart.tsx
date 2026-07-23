import { useState, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VwapPoint } from "../lib/pipeline.ts";
import type { ChartColors } from "../theme.ts";
import { fmtDateTime, fmtPrice, fmtTime } from "../format.ts";

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
  onSelect,
  selectedIndex,
}: {
  live: VwapPoint[];
  overlays: Overlay[];
  colors: ChartColors;
  onRemove: (id: string) => void;
  showLive: boolean;
  onSelect: (index: number) => void;
  selectedIndex: number | null;
}) {
  // All series share the same tick sequence, so we merge by index. When the
  // live curve is hidden we don't plot it in the background at all — the
  // backbone comes from the plotted overlays instead (empty if there are none).
  const backbone = showLive && live.length ? live : overlays[0]?.points ?? [];
  const data = backbone.map((p, i) => {
    const row: Record<string, number | null> = { ts: p.ts };
    if (showLive) row.live = live[i]?.vwap ?? null;
    for (const ov of overlays) row[ov.id] = ov.points[i]?.vwap ?? null;
    return row;
  });

  // Zoom is an X-axis (time) window; null means the full range. While dragging,
  // refLeft/refRight hold the in-progress selection.
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const [refLeft, setRefLeft] = useState<number | null>(null);
  const [refRight, setRefRight] = useState<number | null>(null);
  const didZoom = useRef(false);

  const tsValues = data.map((d) => d.ts as number);
  const tsMin = tsValues.length ? Math.min(...tsValues) : 0;
  const tsMax = tsValues.length ? Math.max(...tsValues) : 1;
  const [xLo, xHi] = xDomain ?? [tsMin, tsMax];
  const inView = (ts: number) => ts >= xLo && ts <= xHi;

  // Y rescales to whatever is currently in view.
  const all: number[] = [];
  if (showLive)
    for (const p of live) if (p.vwap !== null && inView(p.ts)) all.push(p.vwap);
  for (const ov of overlays)
    for (const p of ov.points)
      if (p.vwap !== null && inView(p.ts)) all.push(p.vwap);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo) * 0.25 || hi * 0.002 || 0.01;

  const clampDomain = (a: number, b: number): [number, number] => {
    const nlo = Math.max(tsMin, Math.min(a, b));
    const nhi = Math.min(tsMax, Math.max(a, b));
    return nhi > nlo ? [nlo, nhi] : [tsMin, tsMax];
  };
  // factor < 1 zooms in (narrower window), > 1 zooms out; snaps back to the
  // full range (null) once it covers everything.
  const zoomBy = (factor: number) => {
    const center = (xLo + xHi) / 2;
    const half = ((xHi - xLo) / 2) * factor;
    const next = clampDomain(center - half, center + half);
    setXDomain(next[0] <= tsMin && next[1] >= tsMax ? null : next);
  };

  // Drag across the plot to zoom into that range; a plain click still selects.
  const onMouseDown = (e: any) => {
    didZoom.current = false; // fresh interaction; only a real drag re-arms it
    if (e?.activeLabel == null) return;
    setRefLeft(Number(e.activeLabel));
    setRefRight(null);
  };
  const onMouseMove = (e: any) => {
    if (refLeft != null && e?.activeLabel != null)
      setRefRight(Number(e.activeLabel));
  };
  const onMouseUp = () => {
    if (refLeft != null && refRight != null && refLeft !== refRight) {
      setXDomain(clampDomain(refLeft, refRight));
      didZoom.current = true; // swallow the click that trails the drag
    }
    setRefLeft(null);
    setRefRight(null);
  };

  // Recharts reports the clicked tick as activeTooltipIndex; it may arrive as a
  // stringified index, so coerce and bounds-check before selecting.
  const handleClick = (state: any) => {
    if (didZoom.current) {
      didZoom.current = false;
      return;
    }
    const raw = state?.activeTooltipIndex;
    const idx = typeof raw === "number" ? raw : raw != null ? Number(raw) : NaN;
    if (Number.isInteger(idx) && idx >= 0 && idx < data.length) onSelect(idx);
  };
  const selectedTs =
    selectedIndex != null ? data[selectedIndex]?.ts ?? null : null;

  return (
    <div className="card">
      <div className="chart-head">
        <h2>VWAP over time</h2>
        <div className="zoom-toolbar">
          <button className="btn" onClick={() => zoomBy(1 / 0.6)} aria-label="zoom out">
            −
          </button>
          <button className="btn" onClick={() => zoomBy(0.6)} aria-label="zoom in">
            +
          </button>
          <button
            className="btn"
            onClick={() => setXDomain(null)}
            disabled={xDomain === null}
          >
            Reset
          </button>
        </div>
      </div>
      <p className="card-note">
        The oracle price across every tick for the current filters (the neutral
        line). In static mode, freeze a config as a colored curve to compare.
        Click any point to see how that tick's VWAP was built, or drag across the
        plot to zoom into a time range.
      </p>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320} minWidth={640}>
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, bottom: 20, left: 8 }}
            onClick={handleClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={[xLo, xHi]}
              allowDataOverflow
              scale="time"
              tickFormatter={fmtDateTime}
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
            {selectedTs != null && (
              <ReferenceLine
                x={selectedTs}
                stroke={colors.categorical[0]}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            {refLeft != null && refRight != null && (
              <ReferenceArea
                x1={refLeft}
                x2={refRight}
                strokeOpacity={0.3}
                fill={colors.categorical[0]}
                fillOpacity={0.12}
              />
            )}
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
