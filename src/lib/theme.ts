// Theme registry. A theme is a named palette applied via a `data-theme`
// attribute on <html>; the matching color tokens live in index.css. Each theme
// declares a `mode` (light/dark) that drives anything binary — Monaco's editor
// theme, `color-scheme`, the picker icon. Persisted to localStorage and applied
// before first paint (main.tsx) so there's no flash of the wrong palette.

export type Theme =
  | "dark"
  | "light"
  | "sakura"
  | "lavender"
  | "mint"
  | "peach"
  | "midnight"
  | "rose";

export type ThemeMode = "dark" | "light";

export interface ThemeInfo {
  id: Theme;
  label: string;
  /** One-word vibe shown under the label in the picker. */
  blurb: string;
  mode: ThemeMode;
  /** Five colors for the miniature mockup card: page, panel, lines, text, accent. */
  swatch: { bg: string; side: string; line: string; text: string; accent: string };
}

// Order = the cycle order of the sidebar theme button. Originals first, then
// the soft pastels (light) and the moody darks.
export const THEMES: ThemeInfo[] = [
  {
    id: "dark",
    label: "Espresso",
    blurb: "Warm dark",
    mode: "dark",
    swatch: { bg: "#26231e", side: "#2e2a24", line: "#4a4438", text: "#d9d3c4", accent: "#a9bf6b" },
  },
  {
    id: "light",
    label: "Linen",
    blurb: "Warm light",
    mode: "light",
    swatch: { bg: "#f3eee2", side: "#faf6ec", line: "#d9d2c0", text: "#4a463c", accent: "#6d8a2f" },
  },
  {
    id: "sakura",
    label: "Sakura",
    blurb: "Cherry blossom",
    mode: "light",
    swatch: { bg: "#fdf2f4", side: "#fff8f9", line: "#ecc4d1", text: "#5a3a44", accent: "#e0809f" },
  },
  {
    id: "lavender",
    label: "Lavender",
    blurb: "Soft wisteria",
    mode: "light",
    swatch: { bg: "#f4f1fb", side: "#fbf9ff", line: "#cdc1ea", text: "#3d3654", accent: "#9d83e0" },
  },
  {
    id: "mint",
    label: "Matcha",
    blurb: "Fresh mint",
    mode: "light",
    swatch: { bg: "#eef6f0", side: "#f9fdfa", line: "#b9d8c5", text: "#2a4339", accent: "#3fa97c" },
  },
  {
    id: "peach",
    label: "Peach",
    blurb: "Sweet apricot",
    mode: "light",
    swatch: { bg: "#fdf3ec", side: "#fffaf5", line: "#edc3a8", text: "#5a3f31", accent: "#ef8a5d" },
  },
  {
    id: "midnight",
    label: "Midnight",
    blurb: "Starlit lilac",
    mode: "dark",
    swatch: { bg: "#1b1830", side: "#252140", line: "#3d3666", text: "#ece9f7", accent: "#b89af0" },
  },
  {
    id: "rose",
    label: "Rosé",
    blurb: "Dusky rose",
    mode: "dark",
    swatch: { bg: "#271a20", side: "#34232c", line: "#543a47", text: "#f5e7ed", accent: "#e88aa8" },
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));
const DEFAULT: Theme = "dark";

const KEY = "buddy-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && BY_ID.has(value as Theme);
}

export function themeInfo(id: Theme): ThemeInfo {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT)!;
}

/** light/dark for the things that only care about brightness (Monaco, icons). */
export function themeMode(id: Theme): ThemeMode {
  return themeInfo(id).mode;
}

/** The next theme in registry order — wraps around (sidebar cycle button). */
export function nextTheme(id: Theme): Theme {
  const i = THEMES.findIndex((t) => t.id === id);
  return THEMES[(i + 1) % THEMES.length].id;
}

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return DEFAULT;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore persistence failures
  }
}
