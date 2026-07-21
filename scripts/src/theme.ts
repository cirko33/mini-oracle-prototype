import { useEffect, useState } from "react";
import type { VenueStatus } from "./lib/types.ts";

export type ThemeName = "light" | "dark";

// Chart chrome + ink, per the data-viz reference palette. Two selected modes,
// not an auto-flip.
export interface ChartColors {
  surface: string;
  page: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  categorical: string[]; // overlay curve presets
}

const LIGHT: ChartColors = {
  surface: "#fcfcfb",
  page: "#f9f9f7",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  categorical: [
    "#2a78d6", // blue
    "#eb6834", // orange
    "#1baf7a", // aqua
    "#eda100", // yellow
    "#e87ba4", // magenta
    "#008300", // green
    "#4a3aa7", // violet
    "#e34948", // red
  ],
};

const DARK: ChartColors = {
  surface: "#1a1a19",
  page: "#0d0d0d",
  ink: "#ffffff",
  inkSecondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  categorical: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
};

export function colorsFor(theme: ThemeName): ChartColors {
  return theme === "dark" ? DARK : LIGHT;
}

// Status palette is fixed — never themed (data-viz rule). Paired with a label
// everywhere so meaning never rides on color alone.
export const STATUS_COLORS: Record<VenueStatus, string> = {
  survivor: "#0ca30c", // good
  stale: "#fab219", // warning
  "low-volume": "#ec835a", // serious
  "mad-outlier": "#d03b3b", // critical
  "no-data": "#898781", // muted
};

export const STATUS_LABELS: Record<VenueStatus, string> = {
  survivor: "Survivor",
  stale: "Stale",
  "low-volume": "Low volume",
  "mad-outlier": "MAD outlier",
  "no-data": "No data",
};

// The order statuses appear in the legend.
export const STATUS_ORDER: VenueStatus[] = [
  "survivor",
  "stale",
  "low-volume",
  "mad-outlier",
  "no-data",
];

function initialTheme(): ThemeName {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Theme starts from the OS preference and can be toggled manually. We don't
// keep listening to the OS after mount so a manual choice isn't clobbered.
export function useTheme(): { theme: ThemeName; toggle: () => void } {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = () =>
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}
