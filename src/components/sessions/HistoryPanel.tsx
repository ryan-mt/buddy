import { useEffect, useState } from "react";
import { IconResume, IconTranscript, IconTrash } from "../icons";
import { AGENT_COLOR, AGENT_LOGO } from "../../lib/agents";
import { api, type Profile, type ResumableSession, type SessionRecord } from "../../lib/bindings";

interface HistoryPanelProps {
  sessions: SessionRecord[];
  profiles: Profile[];
  onResumeTracked: (session: SessionRecord) => void;
  onResumeDisk: (session: ResumableSession) => void;
  onViewTranscript: (session: SessionRecord) => void;
  onRemove: (session: SessionRecord) => void;
  onClear: () => void;
}

function ago(secs: number): string {
  const d = Math.max(0, Date.now() / 1000 - secs);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const tabClass = (active: boolean) =>
  `flex-1 rounded-lg py-1 text-[12px] font-medium transition-colors ${
    active
      ? "bg-[var(--color-surface-3)] text-[var(--color-text)]"
      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
  }`;

export function HistoryPanel({
  sessions,
  profiles,
  onResumeTracked,
  onResumeDisk,
  onViewTranscript,
  onRemove,
  onClear,
}: HistoryPanelProps) {
  const [mode, setMode] = useState<"tracked" | "disk">("tracked");
  const [disk, setDisk] = useState<ResumableSession[]>([]);
  const [diskError, setDiskError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "disk") return;
    let cancelled = false;
    api
      .listResumable()
      .then((rows) => {
        if (!cancelled) {
          setDisk(rows);
          setDiskError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setDiskError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const profileColor = (id: string | null) =>
    id ? profiles.find((p) => p.id === id)?.color : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1">
        <button type="button" className={tabClass(mode === "tracked")} onClick={() => setMode("tracked")}>
          Tracked
        </button>
        <button type="button" className={tabClass(mode === "disk")} onClick={() => setMode("disk")}>
          On disk
        </button>
      </div>

      {mode === "tracked" ? (
        <>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              sessions · {sessions.length}
            </span>
            {sessions.some((s) => s.status === "exited") && (
              <button
                type="button"
                onClick={onClear}
                className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] transition hover:text-[var(--color-text)]"
              >
                clear
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
              No sessions yet.
              <br />
              Launched sessions show up here to resume later.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((s) => {
                const Logo = AGENT_LOGO[s.cli];
                const canResume = s.cli === "claude";
                return (
                  <li key={s.id}>
                    <div className="group flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors hover:bg-[var(--color-surface-2)]">
                      <span className="relative flex shrink-0" style={{ color: AGENT_COLOR[s.cli] }}>
                        <Logo size={15} />
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-[var(--color-surface)]"
                          style={{
                            backgroundColor:
                              s.status === "running"
                                ? "var(--color-running)"
                                : "var(--color-text-faint)",
                          }}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] text-[var(--color-text)]">
                            {s.title}
                          </span>
                          {profileColor(s.profileId) && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: profileColor(s.profileId) }}
                            />
                          )}
                        </div>
                        <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
                          {ago(s.lastActiveAt)}
                          {s.cwd ? ` · ${s.cwd}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                        {canResume && (
                          <>
                            <button
                              type="button"
                              onClick={() => onViewTranscript(s)}
                              title="View transcript"
                              className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                            >
                              <IconTranscript size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onResumeTracked(s)}
                              title="Resume session"
                              className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                            >
                              <IconResume size={13} />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemove(s)}
                          title="Forget session"
                          className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            claude on disk · {disk.length}
          </div>
          {diskError ? (
            <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
              {diskError}
            </p>
          ) : disk.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
              No Claude sessions found in <span className="font-mono">~/.claude</span>.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {disk.map((s) => (
                <li key={s.id}>
                  <div
                    onClick={() => onResumeDisk(s)}
                    className="group flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors hover:bg-[var(--color-surface-2)]"
                    title="Resume this session"
                  >
                    <span className="shrink-0 text-[var(--color-claude)]">
                      <IconResume size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-[var(--color-text)]">
                        {s.preview ?? s.id.slice(0, 8)}
                      </div>
                      <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
                        {ago(s.modified)}
                        {s.cwd ? ` · ${s.cwd}` : ""}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
