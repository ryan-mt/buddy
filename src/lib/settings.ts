// User preferences persisted to localStorage. Theme lives separately in
// theme.ts (it must apply before first paint); everything else is here.

export type CursorStyle = "block" | "bar" | "underline";
/** What to do with the previous workspace on launch: offer it, reopen it, or drop it. */
export type RestoreMode = "ask" | "always" | "never";

export interface Settings {
  /** xterm font size for newly opened sessions. */
  terminalFontSize: number;
  /** xterm cursor shape. Applies live. */
  terminalCursorStyle: CursorStyle;
  /** Whether the terminal cursor blinks. Applies live. */
  terminalCursorBlink: boolean;
  /** Scrollback buffer size in lines. Applies live. */
  terminalScrollback: number;
  /** Selecting text in a terminal copies it to the clipboard. */
  terminalCopyOnSelect: boolean;
  /** Ask before closing a session that is still running. */
  confirmClose: boolean;
  /** Flash the taskbar on bells and finished long runs while unfocused. */
  notifications: boolean;
  /** Previous-workspace handling on launch. */
  restoreOnLaunch: RestoreMode;
  /** Initial Claude permission mode pre-selected in the New Session modal. */
  defaultPermission: string;
  /** Initial Claude effort level pre-selected in the New Session modal. */
  defaultEffort: string;
}

export const DEFAULT_SETTINGS: Settings = {
  terminalFontSize: 13,
  terminalCursorStyle: "block",
  terminalCursorBlink: true,
  terminalScrollback: 5000,
  terminalCopyOnSelect: false,
  confirmClose: true,
  notifications: true,
  restoreOnLaunch: "ask",
  defaultPermission: "default",
  defaultEffort: "default",
};

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 20;
export const SCROLLBACK_MIN = 1000;
export const SCROLLBACK_MAX = 100_000;

const KEY = "buddy-settings";

const CURSOR_STYLES: CursorStyle[] = ["block", "bar", "underline"];
const RESTORE_MODES: RestoreMode[] = ["ask", "always", "never"];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? Math.round(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Coerce whatever was persisted into a valid Settings — a corrupted or
 *  out-of-date payload degrades field-by-field instead of breaking the UI. */
export function sanitizeSettings(raw: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    terminalFontSize: clampInt(raw.terminalFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, d.terminalFontSize),
    terminalCursorStyle: oneOf(raw.terminalCursorStyle, CURSOR_STYLES, d.terminalCursorStyle),
    terminalCursorBlink: bool(raw.terminalCursorBlink, d.terminalCursorBlink),
    terminalScrollback: clampInt(raw.terminalScrollback, SCROLLBACK_MIN, SCROLLBACK_MAX, d.terminalScrollback),
    terminalCopyOnSelect: bool(raw.terminalCopyOnSelect, d.terminalCopyOnSelect),
    confirmClose: bool(raw.confirmClose, d.confirmClose),
    notifications: bool(raw.notifications, d.notifications),
    restoreOnLaunch: oneOf(raw.restoreOnLaunch, RESTORE_MODES, d.restoreOnLaunch),
    defaultPermission:
      typeof raw.defaultPermission === "string" ? raw.defaultPermission : d.defaultPermission,
    defaultEffort: typeof raw.defaultEffort === "string" ? raw.defaultEffort : d.defaultEffort,
  };
}

export function getInitialSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeSettings(JSON.parse(raw) as Partial<Settings>);
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
