import { IconClose } from "../icons";
import { AGENT_COLOR } from "../../lib/agents";
import type { SessionTab } from "../../types";

interface SessionListProps {
  sessions: SessionTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function SessionList({ sessions, activeId, onSelect, onClose }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
        No sessions running.
        <br />
        Start one with <span className="text-[var(--color-text-muted)]">+ New session</span>.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {sessions.map((session) => {
        const active = session.id === activeId;
        const dotColor = session.exited ? "var(--color-text-faint)" : AGENT_COLOR[session.cli];
        return (
          <li key={session.id}>
            <div
              onClick={() => onSelect(session.id)}
              className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors ${
                active ? "bg-[var(--color-surface-2)]" : "hover:bg-[var(--color-surface)]"
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r"
                  style={{ backgroundColor: dotColor }}
                />
              )}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: dotColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-[var(--color-text)]">{session.title}</div>
                {session.cwd && (
                  <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
                    {session.cwd}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className="rounded p-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] group-hover:opacity-100"
                title="Close session"
              >
                <IconClose size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
