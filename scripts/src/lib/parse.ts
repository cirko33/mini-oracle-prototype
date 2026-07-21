import type { Snapshot, VenueQuote } from "./types.ts";

// Keys that are not venues in an NDJSON line.
const NON_VENUE_KEYS = new Set(["ts"]);

function toNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Parse one NDJSON line into a Snapshot. Returns null for blank/unparseable
// lines or lines without a numeric `ts` (which we can't place in time).
export function parseLine(line: string): Snapshot | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  const ts = toNumberOrNull(obj.ts);
  if (ts === null) return null;

  const venues: Record<string, VenueQuote> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (NON_VENUE_KEYS.has(key)) continue;
    if (value === null || typeof value !== "object") continue;
    const q = value as Record<string, unknown>;
    venues[key] = {
      price: toNumberOrNull(q.price),
      volume: toNumberOrNull(q.volume),
    };
  }

  return { ts, venues };
}

// Parse a full NDJSON document, dropping bad lines, sorted ascending by ts.
export function parseNdjson(text: string): Snapshot[] {
  const out: Snapshot[] = [];
  for (const line of text.split("\n")) {
    const snap = parseLine(line);
    if (snap) out.push(snap);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// The union of every venue key seen across a list of snapshots, sorted.
export function venueKeys(snapshots: Snapshot[]): string[] {
  const keys = new Set<string>();
  for (const s of snapshots) {
    for (const k of Object.keys(s.venues)) keys.add(k);
  }
  return [...keys].sort();
}
