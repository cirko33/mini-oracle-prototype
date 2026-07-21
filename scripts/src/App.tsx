import { useEffect, useMemo, useRef, useState } from "react";
import { parseNdjson } from "./lib/parse.ts";
import {
  DEFAULT_PARAMS,
  runSnapshot,
  vwapSeries,
} from "./lib/pipeline.ts";
import { makeUsdtUsdIndexLookup } from "./lib/normalize.ts";
import type { FilterParams, Snapshot } from "./lib/types.ts";
import { colorsFor, useTheme } from "./theme.ts";
import { StatsPanel } from "./components/StatsPanel.tsx";
import { Controls } from "./components/Controls.tsx";
import { VwapChart, type Overlay } from "./components/VwapChart.tsx";

interface Feeds {
  dot: Snapshot[];
  usd: Snapshot[];
}

async function loadFeeds(): Promise<Feeds> {
  const [dotRes, usdRes] = await Promise.all([
    fetch("/api/dotprice"),
    fetch("/api/usdprice"),
  ]);
  if (!dotRes.ok) throw new Error(`dotprice feed: ${dotRes.status}`);
  const dotText = await dotRes.text();
  const usdText = usdRes.ok ? await usdRes.text() : "";
  return { dot: parseNdjson(dotText), usd: parseNdjson(usdText) };
}

export function App() {
  const { theme, toggle } = useTheme();
  const colors = useMemo(() => colorsFor(theme), [theme]);

  const [feeds, setFeeds] = useState<Feeds | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [showLive, setShowLive] = useState(true);
  const overlaySeq = useRef(0);

  useEffect(() => {
    loadFeeds()
      .then(setFeeds)
      .catch((e) => setError(String(e)));
  }, []);

  const indexLookup = useMemo(
    () => makeUsdtUsdIndexLookup(feeds?.usd ?? []),
    [feeds],
  );

  const result = useMemo(() => {
    if (!feeds || feeds.dot.length === 0) return null;
    // Summary stats reflect the latest tick.
    return runSnapshot(feeds.dot, feeds.dot.length - 1, params, indexLookup);
  }, [feeds, params, indexLookup]);

  const liveSeries = useMemo(() => {
    if (!feeds || feeds.dot.length === 0) return [];
    return vwapSeries(feeds.dot, params, feeds.usd);
  }, [feeds, params]);

  const onPlot = (color: string, label: string) => {
    if (!feeds) return;
    const points = vwapSeries(feeds.dot, params, feeds.usd);
    const counts = points.map((p) => p.survivorCount);
    const avg = counts.reduce((s, c) => s + c, 0) / (counts.length || 1);
    overlaySeq.current += 1;
    const id = `ov${overlaySeq.current}`;
    const auto = `MAD ${params.madThreshold.toFixed(1)} · vol ${(params.minVolumeShare * 100).toFixed(1)}%`;
    setOverlays((prev) => [
      ...prev,
      { id, label: label || auto, color, points, avgSurvivors: avg },
    ]);
  };

  const onRemove = (id: string) =>
    setOverlays((prev) => prev.filter((o) => o.id !== id));

  if (error) {
    return (
      <div className="app">
        <div className="status-msg">
          Could not load feeds: {error}
          <br />
          Make sure dotprice.ndjson exists at the repo root and the server is
          running.
        </div>
      </div>
    );
  }

  if (!feeds || !result) {
    return (
      <div className="app">
        <div className="status-msg">Loading price feeds…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Mini price oracle — DOT</h1>
          <span className="sub">
            {feeds.dot.length} ticks · normalize to USD → filter stale / thin /
            outliers → VWAP
          </span>
        </div>
        <button className="theme-toggle" onClick={toggle}>
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>

      <div className="card">
        <StatsPanel result={result} />
      </div>

      <Controls
        params={params}
        onParams={setParams}
        onPlot={onPlot}
        onClear={() => setOverlays([])}
        overlayCount={overlays.length}
        palette={colors.categorical}
        showLive={showLive}
        onToggleLive={() => setShowLive((v) => !v)}
      />

      {result.stalenessUndecidable && params.stalenessWindowMs > 0 && (
        <div className="banner">
          Not enough history to evaluate the {" "}
          {(params.stalenessWindowMs / 60000).toFixed(0)}-minute staleness window
          at this tick — the feed doesn't reach back that far yet, so no venue is
          cut as stale. Shrink the window or collect more data.
        </div>
      )}

      <VwapChart
        live={liveSeries}
        overlays={overlays}
        colors={colors}
        onRemove={onRemove}
        showLive={showLive}
      />
    </div>
  );
}
