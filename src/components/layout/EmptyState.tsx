import { IconDownload } from "../icons";
import { Logo } from "../Logo";
import { useApp } from "../../store";

/** Shown when no sessions are open: a calm welcome with the next step. */
export function EmptyState() {
  const clis = useApp((s) => s.clis);
  const clisError = useApp((s) => s.clisError);
  const setInstallOpen = useApp((s) => s.setInstallOpen);
  const hasCli = clis.some((c) => c.available);

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
    </div>
  );
}
