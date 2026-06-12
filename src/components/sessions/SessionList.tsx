import { useEffect, useRef, useState, type DragEvent } from "react";
import { IconClose } from "../icons";
import { AGENT_COLOR, AGENT_LOGO } from "../../lib/agents";
import { PEEK_DELAY_MS, PEEK_HEIGHT, SessionPeek } from "./SessionPeek";
import { useApp } from "../../store";
import type { SessionTab } from "../../types";

const DRAG_MIME = "application/x-buddy-session";

/** One sidebar row. Double-click the title to rename; drag to reorder. */
function SessionRow({ session, index }: { session: SessionTab; index: number }) {
  const active = useApp((s) => s.activeId === session.id);
  const selectSession = useApp((s) => s.selectSession);
  const requestClose = useApp((s) => s.requestClose);
  const renameSession = useApp((s) => s.renameSession);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [dropAt, setDropAt] = useState<"above" | "below" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<number | null>(null);
  const [peekAt, setPeekAt] = useState<{ top: number; left: number } | null>(null);

  const cancelPeek = () => {
    if (peekTimer.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setPeekAt(null);
  };

  useEffect(() => cancelPeek, []);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const activity = useApp((s) => s.activity[session.id]);
  const queuedCount = useApp((s) => s.queued[session.id]?.length ?? 0);

  // The dot narrates the session's life — statically, no blinking: warning
  // ring = wants input, lit halo = streaming output, plain = quiet, faint = exited.
  const dotColor = session.exited
    ? "var(--color-text-faint)"
    : activity === "attention"
      ? "var(--color-warning)"
      : AGENT_COLOR[session.cli];
  const dotClass = session.exited
    ? ""
    : activity === "attention"
      ? "dot-ring"
      : activity === "busy"
        ? "dot-glow"
        : "";
  const AgentLogo = AGENT_LOGO[session.cli];

  /** Reorder on drop: place the dragged row above/below this one. */
  const onDrop = (e: DragEvent) => {
    const draggedId = e.dataTransfer.getData(DRAG_MIME);
    setDropAt(null);
    if (!draggedId || draggedId === session.id) return;
    e.preventDefault();
    const s = useApp.getState();
    const from = s.sessions.findIndex((t) => t.id === draggedId);
    const target = s.sessions.findIndex((t) => t.id === session.id);
    if (from === -1 || target === -1) return;
    let to = target + (dropAt === "below" ? 1 : 0);
    if (from < to) to -= 1;
    s.moveSession(draggedId, to);
  };

  return (
    <li className="rise relative" style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}>
      {dropAt && (
        <span
          className={`pointer-events-none absolute inset-x-1 z-10 h-[2px] rounded-full bg-[var(--color-accent)] ${
            dropAt === "above" ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      <div
        ref={rowRef}
        draggable={!editing}
        onDragStart={(e) => {
          cancelPeek();
          e.dataTransfer.setData(DRAG_MIME, session.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = rowRef.current?.getBoundingClientRect();
          if (rect) setDropAt(e.clientY < rect.top + rect.height / 2 ? "above" : "below");
        }}
        onDragLeave={() => setDropAt(null)}
        onDrop={onDrop}
        onClick={() => {
          cancelPeek();
          selectSession(session.id);
        }}
        onMouseEnter={() => {
          if (editing) return;
          peekTimer.current = window.setTimeout(() => {
            const rect = rowRef.current?.getBoundingClientRect();
            if (!rect) return;
            setPeekAt({
              top: Math.max(8, Math.min(rect.top, window.innerHeight - PEEK_HEIGHT - 8)),
              left: rect.right + 10,
            });
          }, PEEK_DELAY_MS);
        }}
        onMouseLeave={cancelPeek}
        title={activity === "attention" ? "Needs your input" : undefined}
        className={`group relative flex cursor-pointer items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 transition-colors ${
          active
            ? "bg-[var(--color-surface-2)]"
            : activity === "attention"
              ? "bg-[var(--color-warning-dim)] hover:bg-[var(--color-surface)]"
              : "hover:bg-[var(--color-surface)]"
        }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
          style={{ backgroundColor: dotColor, color: dotColor }}
        />
        <span
          className="shrink-0"
          style={{
            color: session.exited ? "var(--color-text-faint)" : AGENT_COLOR[session.cli],
          }}
        >
          <AgentLogo size={13} />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                renameSession(session.id, draft);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  renameSession(session.id, draft);
                  setEditing(false);
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              className="w-full rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-surface)] px-1 py-0 text-[13px] outline-none"
            />
          ) : (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                cancelPeek();
                setDraft(session.title);
                setEditing(true);
              }}
              title="Double-click to rename"
              className="truncate text-[13px] text-[var(--color-text)]"
            >
              {session.title}
            </div>
          )}
          {session.cwd && (
            <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
              {session.cwd}
            </div>
          )}
        </div>
        {queuedCount > 0 && (
          <span
            title={`${queuedCount} prompt${queuedCount > 1 ? "s" : ""} queued`}
            className="shrink-0 rounded-full bg-[var(--color-surface-3)] px-1.5 font-mono text-[10px] leading-4 text-[var(--color-text-muted)]"
          >
            {queuedCount}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            requestClose(session.id);
          }}
          className="rounded-md p-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] group-hover:opacity-100"
          title="Close session"
        >
          <IconClose size={14} />
        </button>
      </div>
      {peekAt && !editing && (
        <SessionPeek session={session} top={peekAt.top} left={peekAt.left} />
      )}
    </li>
  );
}

export function SessionList() {
  const sessions = useApp((s) => s.sessions);

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
      {sessions.map((session, i) => (
        <SessionRow key={session.id} session={session} index={i} />
      ))}
    </ul>
  );
}
