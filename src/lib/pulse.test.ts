import { beforeEach, describe, expect, it } from "vitest";
import {
  PULSE_BUCKET_MS,
  PULSE_WINDOW,
  clearPulse,
  readPulse,
  recordPulse,
  sparkPath,
} from "./pulse";

const T0 = 1_000_000_000_000; // any fixed wall-clock base

describe("pulse lanes", () => {
  beforeEach(() => clearPulse("s1"));

  it("returns a zero-filled window for unknown sessions", () => {
    const values = readPulse("nobody", T0);
    expect(values).toHaveLength(PULSE_WINDOW);
    expect(values.every((v) => v === 0)).toBe(true);
  });

  it("accumulates bytes into the current bucket", () => {
    recordPulse("s1", 100, T0);
    recordPulse("s1", 50, T0 + 10);
    const values = readPulse("s1", T0);
    expect(values[PULSE_WINDOW - 1]).toBe(150);
    expect(values.slice(0, -1).every((v) => v === 0)).toBe(true);
  });

  it("places older output earlier in the window", () => {
    recordPulse("s1", 10, T0);
    recordPulse("s1", 99, T0 + PULSE_BUCKET_MS * 3);
    const values = readPulse("s1", T0 + PULSE_BUCKET_MS * 3);
    expect(values[PULSE_WINDOW - 1]).toBe(99);
    expect(values[PULSE_WINDOW - 4]).toBe(10);
  });

  it("drops buckets that fell out of the window", () => {
    recordPulse("s1", 10, T0);
    // Keep recording far past the window; the old bucket must be pruned.
    for (let i = 1; i <= PULSE_WINDOW + 5; i++) {
      recordPulse("s1", 1, T0 + PULSE_BUCKET_MS * i);
    }
    const values = readPulse("s1", T0 + PULSE_BUCKET_MS * (PULSE_WINDOW + 5));
    expect(values).toHaveLength(PULSE_WINDOW);
    expect(values.includes(10)).toBe(false);
  });

  it("clearPulse forgets the session", () => {
    recordPulse("s1", 42, T0);
    clearPulse("s1");
    expect(readPulse("s1", T0).every((v) => v === 0)).toBe(true);
  });
});

describe("sparkPath", () => {
  it("is empty for all-zero or empty input", () => {
    expect(sparkPath([], 120, 26)).toBe("");
    expect(sparkPath([0, 0, 0], 120, 26)).toBe("");
  });

  it("draws one segment per value, starting with a move", () => {
    const path = sparkPath([0, 5, 10, 5], 120, 26);
    expect(path.startsWith("M")).toBe(true);
    expect(path.split("L")).toHaveLength(4); // M + 3×L
  });

  it("maps bigger values to higher points (smaller y)", () => {
    const path = sparkPath([1, 100], 100, 26);
    const ys = path.match(/[ML][\d.]+ ([\d.]+)/g)!.map((p) => Number(p.split(" ")[1]));
    expect(ys[1]).toBeLessThan(ys[0]);
  });

  it("keeps every point inside the box", () => {
    const path = sparkPath([3, 0, 50, 7, 0, 1], 120, 26);
    for (const part of path.split(" ")) {
      const n = Number(part.replace(/^[ML]/, ""));
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(120);
    }
  });
});
