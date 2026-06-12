import type { ReactNode } from "react";
import {
  IconChat,
  IconDownload,
  IconKeyboard,
  IconPlus,
  IconPulse,
  IconResume,
  IconSearch,
} from "../icons";
import { Logo } from "../Logo";
import { trackSpotlight } from "../../lib/spotlight";
import { useApp } from "../../store";

/** Shown when no sessions are open: a calm welcome that doubles as the map —
 *  the headline things buddy can do, each one click (or one shortcut) away. */
export function EmptyState() {
  const clis = useApp((s) => s.clis);
  const clisError = useApp((s) => s.clisError);
  const setInstallOpen = useApp((s) => s.setInstallOpen);
  const restorable = useApp((s) => s.restorable);
  const restoreMode = useApp((s) => s.settings.restoreOnLaunch);
  const hasCli = clis.some((c) => c.available);
  const offerRestore = restoreMode === "ask";

  const restoreTitles = restorable
    ? restorable.sessions
        .slice(0, 3)
        .map((s) => s.title)
        .join(", ") + (restorable.sessions.length > 3 ? ", …" : "")
    : "";

  const tips: { icon: ReactNode; label: string; kbd: string; run: () => void }[] = [
    {
      icon: <IconPlus size={14} />,
      label: "Launch an agent session",
      kbd: "Ctrl+Shift+T",
      run: () => useApp.getState().openModal({}),
    },
    {
      icon: <IconPulse size={14} />,
      label: "Pulse — every agent at a glance",
      kbd: "Ctrl+Shift+O",
      run: () => useApp.getState().setPulseOpen(true),
    },
    {
      icon: <IconChat size={14} />,
      label: "Chat with Claude or Codex",
      kbd: "Ctrl+Shift+C",
      run: () => useApp.getState().setView("chat"),
    },
    {
      icon: <IconSearch size={14} />,
      label: "Command palette",
      kbd: "Ctrl+Shift+K",
      run: () => useApp.getState().setPaletteOpen(true),
    },
    {
      icon: <IconKeyboard size={14} />,
      label: "Every keyboard shortcut",
      kbd: "Ctrl+Shift+/",
      run: () => useApp.getState().setShortcutsOpen(true),
    },
  ];

  return (
    <div className="atmosphere grain flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Logo size={52} />
      <div className="rise relative font-display text-[19px] font-semibold tracking-tight">
        {hasCli ? "All quiet at basecamp" : "No CLI found"}
      </div>
      <p className="relative max-w-xs text-[13px] leading-relaxed text-[var(--color-text-muted)]">
        {hasCli
          ? "Launch agents, watch them work, jump in when they need you."
          : (clisError ?? "Install a supported CLI — Claude, Codex, Gemini, opencode, or Grok.")}
      </p>
      {!hasCli && (
        <button
          type="button"
          onClick={() => setInstallOpen(true)}
          className="relative flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110"
        >
          <IconDownload size={15} /> Install a CLI
        </button>
      )}
      {hasCli && (
        <div className="relative mt-1 flex w-[340px] max-w-full flex-col gap-1">
          {tips.map((tip, i) => (
            <button
              key={tip.label}
              type="button"
              onClick={tip.run}
              onPointerMove={trackSpotlight}
              style={{ animationDelay: `${i * 45}ms` }}
              className="glass glass-spot rise flex items-center gap-2.5 rounded-full border border-[var(--glass-border)] py-2 pl-3.5 pr-2 text-left transition hover:-translate-y-px hover:shadow-[var(--shadow-pop)]"
            >
              <span className="shrink-0 text-[var(--color-accent)]">{tip.icon}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{tip.label}</span>
              <kbd className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-faint)]">
                {tip.kbd}
              </kbd>
            </button>
          ))}
          <p className="pt-1.5 text-[11px] text-[var(--color-text-faint)]">
            Running agents line up in the dock below — hover one for a live peek.
          </p>
        </div>
      )}
      {hasCli && restorable && offerRestore && (
        <div className="glass-strong relative mt-2 flex flex-col items-center gap-2.5 rounded-2xl border border-[var(--glass-border)] px-6 py-4">
          <span className="text-[13px] font-medium">
            Previous workspace — {restorable.sessions.length} session
            {restorable.sessions.length > 1 ? "s" : ""}
          </span>
          <span className="max-w-xs truncate text-[12px] text-[var(--color-text-muted)]">
            {restoreTitles}
          </span>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => useApp.getState().restoreWorkspace()}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
            >
              <IconResume size={14} /> Restore
            </button>
            <button
              type="button"
              onClick={() => useApp.getState().dismissRestore()}
              className="rounded-xl px-3 py-1.5 text-[12px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
