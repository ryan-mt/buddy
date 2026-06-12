import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  getInitialTheme,
  isTheme,
  nextTheme,
  THEMES,
  themeInfo,
  themeMode,
  type Theme,
} from "./theme";

describe("theme registry", () => {
  it("ids are unique and the two originals are present (back-compat)", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("dark");
    expect(ids).toContain("light");
  });

  it("every theme carries a label, blurb, mode, and full swatch", () => {
    for (const t of THEMES) {
      expect(t.label).toBeTruthy();
      expect(t.blurb).toBeTruthy();
      expect(["dark", "light"]).toContain(t.mode);
      for (const key of ["bg", "side", "line", "text", "accent"] as const) {
        expect(t.swatch[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("isTheme", () => {
  it("accepts known ids, rejects everything else", () => {
    expect(isTheme("sakura")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("hotdog")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe("themeInfo / themeMode", () => {
  it("resolve known ids", () => {
    expect(themeInfo("sakura").label).toBe("Sakura");
    expect(themeMode("midnight")).toBe("dark");
    expect(themeMode("sakura")).toBe("light");
  });

  it("fall back to the default for an unknown id", () => {
    expect(themeInfo("bogus" as Theme).id).toBe("dark");
  });
});

describe("nextTheme", () => {
  it("advances through the registry and wraps around", () => {
    const order = THEMES.map((t) => t.id);
    for (let i = 0; i < order.length; i++) {
      expect(nextTheme(order[i])).toBe(order[(i + 1) % order.length]);
    }
  });

  it("cycling the full length returns to the start", () => {
    let id = THEMES[0].id;
    for (let i = 0; i < THEMES.length; i++) id = nextTheme(id);
    expect(id).toBe(THEMES[0].id);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("getInitialTheme defaults to dark and round-trips a saved theme", () => {
    expect(getInitialTheme()).toBe("dark");
    applyTheme("lavender");
    expect(getInitialTheme()).toBe("lavender");
    expect(document.documentElement.dataset.theme).toBe("lavender");
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem("buddy-theme", "not-a-theme");
    expect(getInitialTheme()).toBe("dark");
  });
});
