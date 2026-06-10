// Light/dark theme, applied via a `data-theme` attribute on <html> and
// persisted to localStorage. index.css overrides the color tokens under
// `:root[data-theme="light"]`.

export type Theme = "light" | "dark";

const KEY = "buddy-theme";

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore persistence failures
  }
}
