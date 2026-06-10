import { useEffect, useMemo, useState } from "react";
import { IconClose, IconSpinner } from "../icons";
import { AGENT_COLOR } from "../../lib/agents";
import { api, type SessionRecord, type TranscriptEntry } from "../../lib/bindings";

interface TranscriptViewerProps {
  session: SessionRecord;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  user: "You",
  assistant: "Claude",
  system: "System",
  summary: "Summary",
};

function roleStyle(role: string): string {
  switch (role) {
    case "user":
      return "border-[var(--color-accent-dim)] bg-[var(--color-surface-2)]";
    case "assistant":
      return "border-[var(--color-border)] bg-[var(--color-surface)]";
    case "summary":
      return "border-dashed border-[var(--color-border)] bg-transparent italic";
    default:
      return "border-[var(--color-border-soft)] bg-transparent";
  }
}

export function TranscriptViewer({ session, onClose }: TranscriptViewerProps) {
  const [entries, setEntries] = useState<TranscriptEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    api
      .readTranscript(session.id)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  const totalTokens = useMemo(
    () => (entries ?? []).reduce((sum, e) => sum + (e.tokens ?? 0), 0),
    [entries],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--color-border-soft)] px-4">
        <span style={{ color: AGENT_COLOR[session.cli] }} className="flex">
          <IconTranscriptDot />
        </span>
        <span className="text-[13px] font-medium">{session.title}</span>
        <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
          transcript
        </span>
        {entries && entries.length > 0 && (
          <span className="font-mono text-[11px] text-[var(--color-text-faint)]">
            {entries.length} msgs{totalTokens > 0 ? ` · ${totalTokens.toLocaleString()} tok` : ""}
          </span>
        )}
        <span className="ml-auto truncate pl-4 font-mono text-[11px] text-[var(--color-text-faint)]">
          {session.cwd ?? ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close transcript"
          className="ml-3 rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <IconClose size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
            {error}
          </div>
        ) : !entries ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]">
            <IconSpinner size={16} className="animate-spin" /> Reading transcript…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-text-faint)]">
            This transcript is empty.
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
            {entries.map((e, i) => (
              <div key={i} className={`rounded-xl border px-3.5 py-2.5 ${roleStyle(e.role)}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[var(--color-text-faint)]">
                    {ROLE_LABEL[e.role] ?? e.role}
                  </span>
                  {e.tokens ? (
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">
                      {e.tokens.toLocaleString()} tok
                    </span>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--color-text)]">
                  {e.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small inline status dot reused for the header accent. */
function IconTranscriptDot() {
  return <span className="block h-2 w-2 rounded-full bg-current" />;
}
