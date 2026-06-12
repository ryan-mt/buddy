// Settings, as a two-pane glass sheet: a slim nav rail on the left, one
// focused panel on the right. Theme switching is a pair of miniature app
// mockups rather than a labelled toggle, the cursor picker is a row of tiny
// terminal lines, and the font-size slider previews itself live.

import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { getVersion } from "@tauri-apps/api/app";
import {
  IconBookmark,
  IconClose,
  IconCode,
  IconDownload,
  IconFolder,
  IconMoon,
  IconResume,
  IconSettings,
  IconSparkle,
  IconSpinner,
  IconSun,
  IconTerminal,
  IconTrash,
} from "./icons";
import { Logo } from "./Logo";
import { CLI_CAPS } from "../lib/agents";
import { api } from "../lib/bindings";
import { THEMES, type ThemeInfo } from "../lib/theme";
import { useApp } from "../store";
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type CursorStyle,
  type RestoreMode,
  type Settings,
} from "../lib/settings";
import type { Theme } from "../lib/theme";

const labelClass = "mb-1.5 block text-[12px] font-medium text-[var(--color-text-muted)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]";
const buttonClass =
  "flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12.5px] text-[var(--color-text)] transition hover:border-[var(--color-accent-dim)]";

const SHORTCUTS: [string, string][] = [
  ["Ctrl+Shift+K", "Command palette"],
  ["Ctrl+Shift+T", "New session"],
  ["Ctrl+Shift+W", "Close session"],
  ["Ctrl+Shift+C", "Toggle chat"],
  ["Ctrl+K / Ctrl+Shift+F", "Find in terminal"],
  ["Ctrl+Shift+G", "Git changes"],
  ["Ctrl+Shift+Z", "Zoom pane"],
  ["Ctrl+Shift+B", "Broadcast input"],
  ["Ctrl+Shift+P", "Prompt queue"],
  ["Ctrl+Shift+O", "Pulse overview"],
  ["Ctrl+Shift+A", "Jump to waiting agent"],
  ["Ctrl+Shift+1…9", "Switch session"],
  ["Ctrl+Shift+,", "Settings"],
];

const SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10_000, 20_000, 50_000];

const RESTORE_OPTIONS: { value: RestoreMode; label: string }[] = [
  { value: "ask", label: "Offer to restore" },
  { value: "always", label: "Restore automatically" },
  { value: "never", label: "Don't restore" },
];

type Tab = "appearance" | "terminal" | "behavior" | "defaults" | "data" | "shortcuts" | "about";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <IconSun size={14} /> },
  { id: "terminal", label: "Terminal", icon: <IconTerminal size={14} /> },
  { id: "behavior", label: "Behavior", icon: <IconSettings size={14} /> },
  { id: "defaults", label: "Defaults", icon: <IconBookmark size={14} /> },
  { id: "data", label: "Data", icon: <IconFolder size={14} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <IconCode size={14} /> },
  { id: "about", label: "About", icon: <IconSparkle size={14} /> },
];

/** Miniature app mockup acting as one theme swatch in the picker grid. */
function ThemeCard({ info, active, onSelect }: { info: ThemeInfo; active: boolean; onSelect: () => void }) {
  const p = info.swatch;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      title={info.blurb}
      className={`rounded-xl border p-1.5 text-left transition ${
        active
          ? "border-[var(--color-accent)] shadow-[var(--shadow-pop)]"
          : "border-[var(--color-border)] hover:border-[var(--color-accent-dim)]"
      }`}
    >
      <span
        className="block overflow-hidden rounded-lg border"
        style={{ backgroundColor: p.bg, borderColor: p.line }}
      >
        <span className="flex h-[58px]">
          <span className="flex w-1/4 flex-col gap-1 p-1.5" style={{ backgroundColor: p.side }}>
            <span className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: p.accent }} />
            <span className="h-1 w-full rounded-full" style={{ backgroundColor: p.line }} />
            <span className="h-1 w-5/6 rounded-full" style={{ backgroundColor: p.line }} />
          </span>
          <span className="flex flex-1 flex-col items-center justify-center gap-1 px-2">
            <span className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: p.text }} />
            <span className="h-1 w-2/3 rounded-full" style={{ backgroundColor: p.line }} />
            <span className="mt-0.5 h-2 w-2/5 rounded-full" style={{ backgroundColor: p.accent }} />
          </span>
        </span>
      </span>
      <span className="mt-1.5 flex items-center justify-center gap-1.5 text-[12px] font-medium">
        {info.mode === "dark" ? <IconMoon size={12} /> : <IconSun size={12} />}
        {info.label}
      </span>
    </button>
  );
}

/** A tiny terminal line acting as the cursor-style switch (static — no blink). */
function CursorCard({
  style,
  active,
  onSelect,
}: {
  style: CursorStyle;
  active: boolean;
  onSelect: () => void;
}) {
  const cursor =
    style === "block" ? (
      <span className="inline-block h-[13px] w-[7px] translate-y-[2px] bg-[#ece5d8]" />
    ) : style === "bar" ? (
      <span className="inline-block h-[13px] w-[2px] translate-y-[2px] bg-[#ece5d8]" />
    ) : (
      <span className="inline-block h-[13px] w-[7px] translate-y-[2px] border-b-2 border-[#ece5d8]" />
    );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex-1 rounded-xl border p-1.5 text-left transition ${
        active
          ? "border-[var(--color-accent)] shadow-[var(--shadow-pop)]"
          : "border-[var(--color-border)] hover:border-[var(--color-accent-dim)]"
      }`}
    >
      <span className="block rounded-lg bg-[var(--color-term-well)] px-2.5 py-2 font-mono text-[12px] leading-none text-[#a8a08e]">
        ~ ${" "}{cursor}
      </span>
      <span className="mt-1.5 block text-center text-[11.5px] font-medium capitalize">{style}</span>
    </button>
  );
}

/** Label + hint on the left, a glass switch on the right. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="-mx-1.5 flex w-[calc(100%+12px)] items-center justify-between gap-3 rounded-lg px-1.5 py-2 text-left transition hover:bg-[var(--color-surface-2)]/60"
    >
      <span className="min-w-0">
        <span className="block text-[13px] text-[var(--color-text)]">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--color-text-faint)]">
            {hint}
          </span>
        )}
      </span>
      <span
        className={`relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-3)]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

interface SettingsModalProps {
  open: boolean;
  settings: Settings;
  theme: Theme;
  onChangeSettings: (settings: Settings) => void;
  onChangeTheme: (theme: Theme) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  settings,
  theme,
  onChangeSettings,
  onChangeTheme,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("appearance");
  const [version, setVersion] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const clis = useApp((s) => s.clis);
  const cliUpdates = useApp((s) => s.cliUpdates);
  const checkingUpdates = useApp((s) => s.checkingUpdates);
  const updatingCli = useApp((s) => s.updatingCli);
  const historyCount = useApp((s) => s.history.length);
  const patch = (part: Partial<Settings>) => onChangeSettings({ ...settings, ...part });
  const claude = CLI_CAPS.claude;

  useEffect(() => {
    if (!open || version !== null) return;
    getVersion().then(setVersion, () => setVersion("dev"));
  }, [open, version]);

  // The destructive-confirm arm disarms itself after a beat, and never
  // survives switching tabs or reopening the modal.
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);
  useEffect(() => {
    setConfirmClear(false);
  }, [tab, open]);

  const scrollbackOptions = SCROLLBACK_OPTIONS.includes(settings.terminalScrollback)
    ? SCROLLBACK_OPTIONS
    : [...SCROLLBACK_OPTIONS, settings.terminalScrollback].sort((a, b) => a - b);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px] animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 flex h-[520px] max-h-[88vh] w-[640px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--glass-border)] animate-[popIn_180ms_var(--ease-natural)]">
          {/* Nav rail */}
          <div className="flex w-[164px] shrink-0 flex-col border-r border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/40 p-3">
            <Dialog.Title className="mb-3 px-1.5 text-[14px] font-semibold">Settings</Dialog.Title>
            <nav className="flex flex-col gap-0.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition ${
                    tab === t.id
                      ? "bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className={tab === t.id ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]"}>
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="mt-auto px-1.5 font-mono text-[10px] text-[var(--color-text-faint)]">
              buddy {version ?? ""}
            </div>
          </div>

          {/* Panel */}
          <div className="relative flex-1 overflow-y-auto p-5">
            <Dialog.Close
              className="absolute right-3 top-3 rounded-md p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>

            {tab === "appearance" && (
              <div>
                <label className={labelClass}>Theme</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {THEMES.map((info) => (
                    <ThemeCard
                      key={info.id}
                      info={info}
                      active={theme === info.id}
                      onSelect={() => onChangeTheme(info.id)}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                  Eight palettes — soft pastels and moody darks. Terminals keep their deep well in
                  every theme; TUIs render best on dark. Tip: the sidebar sun/moon cycles through.
                </p>
              </div>
            )}

            {tab === "terminal" && (
              <div>
                <label className={labelClass}>Font size · {settings.terminalFontSize}px</label>
                <input
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step={1}
                  value={settings.terminalFontSize}
                  onChange={(e) => patch({ terminalFontSize: Number(e.target.value) })}
                  className="w-full accent-[var(--color-accent)]"
                />
                <div className="mt-2 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-3 py-2.5">
                  <span className="font-mono" style={{ fontSize: settings.terminalFontSize }}>
                    $ buddy — the quick brown fox
                  </span>
                </div>

                <div className="mt-5">
                  <label className={labelClass}>Cursor</label>
                  <div className="flex gap-3">
                    {(["block", "bar", "underline"] as CursorStyle[]).map((style) => (
                      <CursorCard
                        key={style}
                        style={style}
                        active={settings.terminalCursorStyle === style}
                        onSelect={() => patch({ terminalCursorStyle: style })}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-col">
                  <ToggleRow
                    label="Blinking cursor"
                    checked={settings.terminalCursorBlink}
                    onChange={(v) => patch({ terminalCursorBlink: v })}
                  />
                  <ToggleRow
                    label="Copy on select"
                    hint="Selecting text copies it to the clipboard. Right-click always pastes."
                    checked={settings.terminalCopyOnSelect}
                    onChange={(v) => patch({ terminalCopyOnSelect: v })}
                  />
                </div>

                <div className="mt-3">
                  <label className={labelClass}>Scrollback</label>
                  <select
                    value={settings.terminalScrollback}
                    onChange={(e) => patch({ terminalScrollback: Number(e.target.value) })}
                    className={fieldClass}
                  >
                    {scrollbackOptions.map((n) => (
                      <option key={n} value={n}>
                        {n.toLocaleString()} lines
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
                    All of these apply to open sessions immediately.
                  </p>
                </div>
              </div>
            )}

            {tab === "behavior" && (
              <div className="flex flex-col">
                <ToggleRow
                  label="Confirm before closing"
                  hint="Ask before a running session is closed (Ctrl+Shift+W or the tab's ×)."
                  checked={settings.confirmClose}
                  onChange={(v) => patch({ confirmClose: v })}
                />
                <ToggleRow
                  label="Taskbar alerts"
                  hint="Flash the taskbar when an agent needs you, or a long run finishes while buddy is in the background."
                  checked={settings.notifications}
                  onChange={(v) => patch({ notifications: v })}
                />
                <div className="mt-3">
                  <label className={labelClass}>Previous workspace on launch</label>
                  <select
                    value={settings.restoreOnLaunch}
                    onChange={(e) => patch({ restoreOnLaunch: e.target.value as RestoreMode })}
                    className={fieldClass}
                  >
                    {RESTORE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                    After a restart or crash, Claude sessions resume their conversation; other CLIs
                    relaunch with the same setup.
                  </p>
                </div>
              </div>
            )}

            {tab === "defaults" && (
              <div>
                <div className="mb-4">
                  <label className={labelClass}>Default permission (Claude)</label>
                  <select
                    value={settings.defaultPermission}
                    onChange={(e) => patch({ defaultPermission: e.target.value })}
                    className={fieldClass}
                  >
                    {claude.permissions?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className={labelClass}>Default effort (Claude)</label>
                  <select
                    value={settings.defaultEffort}
                    onChange={(e) => patch({ defaultEffort: e.target.value })}
                    className={fieldClass}
                  >
                    {claude.effort?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                  Pre-selected in the New Session dialog — each session can still override them.
                </p>
              </div>
            )}

            {tab === "data" && (
              <div>
                <label className={labelClass}>Storage</label>
                <div className="flex flex-col items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
                  <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                    Threads, history, profiles and projects live in a local SQLite database. buddy
                    stores no API keys.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      api.revealDataDir().catch((e) =>
                        useApp.getState().pushToast(String((e as { message?: string })?.message ?? e), "error"),
                      )
                    }
                    className={buttonClass}
                  >
                    <IconFolder size={14} /> Open data folder
                  </button>
                </div>

                <div className="mt-4">
                  <label className={labelClass}>Backup</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void useApp.getState().exportBackup()}
                      className={buttonClass}
                    >
                      <IconDownload size={14} /> Export backup…
                    </button>
                    <button
                      type="button"
                      onClick={() => void useApp.getState().importBackup()}
                      className={buttonClass}
                    >
                      <IconResume size={14} /> Import backup…
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
                    Settings, theme, snippets, formations and chat preferences as one JSON file.
                    Importing replaces them.
                  </p>
                </div>

                <div className="mt-4">
                  <label className={labelClass}>Session history</label>
                  <button
                    type="button"
                    disabled={historyCount === 0}
                    onClick={() => {
                      if (!confirmClear) {
                        setConfirmClear(true);
                        return;
                      }
                      setConfirmClear(false);
                      void useApp.getState().clearHistory();
                      useApp.getState().pushToast("Session history cleared");
                    }}
                    className={`${buttonClass} disabled:cursor-default disabled:opacity-50 ${
                      confirmClear ? "border-[var(--color-danger)] text-[var(--color-danger)]" : ""
                    }`}
                  >
                    <IconTrash size={14} />
                    {historyCount === 0
                      ? "History is empty"
                      : confirmClear
                        ? `Click again to clear ${historyCount} entr${historyCount > 1 ? "ies" : "y"}`
                        : `Clear session history (${historyCount})`}
                  </button>
                  <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
                    Removes buddy's session list only — CLI transcripts on disk stay.
                  </p>
                </div>

                <div className="mt-4">
                  <label className={labelClass}>Settings</label>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeSettings(DEFAULT_SETTINGS);
                      useApp.getState().pushToast("Settings reset to defaults");
                    }}
                    className={buttonClass}
                  >
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}

            {tab === "shortcuts" && (
              <div>
                <label className={labelClass}>Keyboard shortcuts</label>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
                  {SHORTCUTS.map(([keys, action]) => (
                    <div key={keys} className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[var(--color-text-muted)]">{action}</span>
                      <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text)]">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">
                  On macOS the same chords work with Cmd in place of Ctrl.
                </p>
              </div>
            )}

            {tab === "about" && (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <Logo size={36} />
                  <div>
                    <div className="text-[15px] font-semibold leading-tight">
                      buddy <span className="font-mono text-[11px] font-normal text-[var(--color-text-faint)]">{version ?? ""}</span>
                    </div>
                    <div className="text-[12px] text-[var(--color-text-muted)]">
                      One desk for your agent CLIs — sessions, chat, projects.
                    </div>
                  </div>
                </div>

                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[var(--color-text-muted)]">
                    Detected CLIs
                  </span>
                  <div className="flex items-center gap-1.5">
                    {cliUpdates.some((u) => u.hasUpdate) && (
                      <button
                        type="button"
                        onClick={() => void useApp.getState().updateAllClis()}
                        disabled={Object.keys(updatingCli).length > 0}
                        className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-[11px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:opacity-50"
                      >
                        Update all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void useApp.getState().checkCliUpdates(false)}
                      disabled={checkingUpdates}
                      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] transition hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text)] disabled:opacity-50"
                    >
                      {checkingUpdates ? "Checking…" : "Check for updates"}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
                  {clis.length === 0 ? (
                    <span className="text-[12px] text-[var(--color-text-faint)]">Still detecting…</span>
                  ) : (
                    clis.map((c) => {
                      const update = cliUpdates.find((u) => u.kind === c.kind);
                      const updating = !!updatingCli[c.kind];
                      return (
                        <div key={c.kind} className="flex h-6 items-center gap-2 text-[12px]">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: c.available ? "var(--color-running)" : "var(--color-text-faint)",
                            }}
                          />
                          <span className="w-20 shrink-0 font-medium">{c.label}</span>
                          <span className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                            {c.available ? c.version ?? "installed" : "not installed"}
                          </span>
                          {update?.hasUpdate && (
                            <span className="shrink-0 font-mono text-[11px] text-[var(--color-accent)]">
                              → {update.latest}
                            </span>
                          )}
                          {update?.hasUpdate ? (
                            <button
                              type="button"
                              onClick={() => void useApp.getState().updateCli(c.kind)}
                              disabled={updating}
                              className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
                            >
                              {updating && <IconSpinner size={10} className="animate-spin" />}
                              {updating ? "Updating…" : "Update"}
                            </button>
                          ) : c.available ? (
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                              {update && (
                                <span className="text-[10.5px] text-[var(--color-running)]">up to date</span>
                              )}
                              {/* Always available: force a re-run of the vendor installer to
                                  pull the latest, even when no update was detected. */}
                              <button
                                type="button"
                                onClick={() => void useApp.getState().updateCli(c.kind)}
                                disabled={updating}
                                title={`Reinstall ${c.label} (pulls the latest)`}
                                className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] transition hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text)] disabled:opacity-60"
                              >
                                {updating && <IconSpinner size={10} className="animate-spin" />}
                                {updating ? "Updating…" : "Reinstall"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                  Chat and sessions ride these logins directly — buddy stores no API keys. Updates
                  re-run each vendor&apos;s official install command.
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
