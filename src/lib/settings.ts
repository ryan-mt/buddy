// User preferences persisted to localStorage. Theme lives separately in
// theme.ts (it must apply before first paint); everything else is here.

export interface Settings {
  /** xterm font size for newly opened sessions. */
  terminalFontSize: number;
  /** Initial Claude permission mode pre-selected in the New Session modal. */
  defaultPermission: string;
  /** Initial Claude effort level pre-selected in the New Session modal. */
  defaultEffort: string;
}

export const DEFAULT_SETTINGS: Settings = {
  terminalFontSize: 13,
  defaultPermission: "default",
  defaultEffort: "default",
};

const KEY = "buddy-settings";

export function getInitialSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // localStorage unavailable or malformed — fall back to defaults.
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore persistence failures
  }
}
