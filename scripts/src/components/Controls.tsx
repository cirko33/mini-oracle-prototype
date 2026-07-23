import { useState } from "react";
import type { FilterParams } from "../lib/types.ts";
import { fmtDuration } from "../format.ts";

interface Props {
  params: FilterParams;
  onParams: (p: FilterParams) => void;
  onPlot: (color: string, label: string) => void;
  onClear: () => void;
  overlayCount: number;
  palette: string[];
  showLive: boolean;
  onToggleLive: () => void;
}

function Slider(props: {
  name: string;
  format: (raw: number) => string;
  min: number;
  max: number;
  step: number;
  raw: number;
  hint?: string;
  onCommit: (v: number) => void;
}) {
  // Track the value locally while dragging so the thumb and label stay live,
  // but only commit to params on release so the chart recomputes once, not on
  // every frame (which flickers).
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? props.raw;
  const commit = (v: number) => {
    setDragging(null);
    props.onCommit(v);
  };
  return (
    <div className="slider">
      <div className="slider-head">
        <span className="name">{props.name}</span>
        <span className="val">{props.format(shown)}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={shown}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
      />
      <span className="hint">{props.hint ?? ""}</span>
    </div>
  );
}

export function Controls(props: Props) {
  const { params, onParams } = props;
  const [color, setColor] = useState(props.palette[0]!);
  const [label, setLabel] = useState("");

  const set = (patch: Partial<FilterParams>) =>
    onParams({ ...params, ...patch });

  return (
    <div className="card">
      <h2>Filters</h2>
      <p className="card-note">
        Move any slider and the live curve recomputes. Hit <b>Plot</b> to freeze
        the current config as a colored curve and keep going on a fresh live one.
      </p>

      <div className="controls-grid">
        <Slider
          name="Staleness window"
          format={(min) => fmtDuration(min * 60000)}
          min={0}
          max={1440}
          step={5}
          raw={params.stalenessWindowMs / 60000}
          hint="Drop venues whose price is flat across this lookback (0–24h)."
          onCommit={(min) => set({ stalenessWindowMs: min * 60000 })}
        />
        <Slider
          name="Min volume share"
          format={(pct) => `${pct.toFixed(1)}%`}
          min={0}
          max={100}
          step={0.1}
          raw={params.minVolumeShare * 100}
          hint="Drop venues below this share of total USD volume (Vp/Vtotal)."
          onCommit={(pct) => set({ minVolumeShare: pct / 100 })}
        />
        <Slider
          name="MAD threshold"
          format={(v) => (v === 0 ? "off" : v.toFixed(1))}
          min={0}
          max={5}
          step={0.1}
          raw={params.madThreshold}
          hint="Drop prices whose modified z-score exceeds this (0 = off)."
          onCommit={(v) => set({ madThreshold: v })}
        />
      </div>

      <div className="controls-footer">
        <div className="plot-controls">
          <span className="swatch">
            {props.palette.map((c) => (
              <button
                key={c}
                className={c === color ? "sel" : ""}
                style={{ background: c }}
                aria-label={`color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </span>
          <input
            type="text"
            placeholder="label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            className="btn primary"
            onClick={() => {
              props.onPlot(color, label.trim());
              setLabel("");
            }}
          >
            Plot
          </button>
          <button
            className="btn"
            onClick={props.onClear}
            disabled={props.overlayCount === 0}
          >
            Clear ({props.overlayCount})
          </button>
          <button className="btn" onClick={props.onToggleLive}>
            {props.showLive ? "Hide current" : "Show current"}
          </button>
        </div>
      </div>
    </div>
  );
}
