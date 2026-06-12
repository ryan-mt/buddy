// The Pulse heartbeat: per-session output volume, bucketed into a short
// rolling window. Fed from the terminal output stream (a byte count per
// chunk), read by the Pulse overlay to draw each agent's activity sparkline.
// A plain module map (like terminalRegistry) — recording must never re-render.

/** One sparkline bucket covers this many milliseconds. */
export const PULSE_BUCKET_MS = 5_000;
/** Buckets kept per session — 24 × 5s = a two-minute window. */
export const PULSE_WINDOW = 24;

/** bucket index → bytes seen in that bucket, per session tab id. */
const lanes = new Map<string, Map<number, number>>();

/** Add a chunk's byte count to the session's current bucket. */
export function recordPulse(id: string, bytes: number, now = Date.now()): void {
  const bucket = Math.floor(now / PULSE_BUCKET_MS);
  let lane = lanes.get(id);
  if (!lane) {
    lane = new Map();
    lanes.set(id, lane);
  }
  lane.set(bucket, (lane.get(bucket) ?? 0) + bytes);
  // Prune buckets that fell out of the window so lanes never grow unbounded.
  if (lane.size > PULSE_WINDOW + 2) {
    const oldest = bucket - PULSE_WINDOW;
    for (const key of lane.keys()) {
      if (key < oldest) lane.delete(key);
    }
  }
}

/** The window's byte counts, oldest bucket first (zero-filled, always PULSE_WINDOW long). */
export function readPulse(id: string, now = Date.now()): number[] {
  const lane = lanes.get(id);
  const bucket = Math.floor(now / PULSE_BUCKET_MS);
  const out: number[] = [];
  for (let i = bucket - PULSE_WINDOW + 1; i <= bucket; i++) {
    out.push(lane?.get(i) ?? 0);
  }
  return out;
}

export function clearPulse(id: string): void {
  lanes.delete(id);
}

/**
 * SVG path for a sparkline over `values`, square-root scaled so a single
 * giant burst doesn't flatten the rest of the line into the baseline.
 * Returns "" when there is nothing to draw (all zero) — the caller keeps
 * just its baseline.
 */
export function sparkPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  if (max <= 0) return "";
  const pad = 1.5;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * step;
      const y = pad + innerH * (1 - Math.sqrt(Math.max(v, 0) / max));
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
