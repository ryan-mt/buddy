import { IconDownload, IconResume } from "../icons";
import { Logo } from "../Logo";
import { useApp } from "../../store";

/** Shown when no sessions are open: a calm welcome with the next step. */
export function EmptyState() {
  const clis = useApp((s) => s.clis);
  const clisError = useApp((s) => s.clisError);
  const setInstallOpen = useApp((s) => s.setInstallOpen);
  const restorable = useApp((s) => s.restorable);
  const hasCli = clis.some((c) => c.available);

  const restoreTitles = restorable
    ? restorable.sessions
        .slice(0, 3)
        .map((s) => s.title)
        .join(", ") + (restorable.sessions.length > 3 ? ", …" : "")
    : "";

  return (
    <div className="atmosphere grain flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Logo size={52} />
      <div className="relative text-[15px] font-medium">
        {hasCli ? "No active session" : "No CLI found"}
      </div>
      <p className="relative max-w-xs text-[13px] leading-relaxed text-[var(--color-text-muted)]">
        {hasCli
          ? "Start one from the CLI tab, or open a project folder under Projects."
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
      {hasCli && restorable && (
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
