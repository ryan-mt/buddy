// The agent dock — buddy's signature element. A floating glass strip along
// the bottom with one live chip per session: status dot, name, and a small
// output heartbeat. It rides above the editor and overlays too, so every
// agent stays one glance — and one click — away from anywhere in the app.
// Hover a chip for a live peek; the strip also carries the "N waiting" jump,
// the Pulse board, and new-session.

import { useEffect, useRef, useState } from "react";
import { IconPlus, IconPulse } from "../icons";
import { AGENT_COLOR, AGENT_LOGO } from "../../lib/agents";
import { readPulse, sparkPath } from "../../lib/pulse";
import { PEEK_DELAY_MS, PEEK_HEIGHT, PEEK_WIDTH, SessionPeek } from "../sessions/SessionPeek";
import { useApp } from "../../store";
import type { SessionTab } from "../../types";

const dockBtn =
  "shrink-0 rounded-full p-2 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";

function DockChip({ session, now }: { session: SessionTab; now: number }) {
  const active = useApp((s) => s.activeId === session.id);
  const activity = useApp((s) => s.activity[session.id]);
  const queuedCount = useApp((s) => s.queued[session.id]?.length ?? 0);
  const chipRef = useRef<HTMLButtonElement>(null);
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

  const Logo = AGENT_LOGO[session.cli];
  const color = AGENT_COLOR[session.cli];
  const dotColor = session.exited
    ? "var(--color-text-faint)"
    : activity === "attention"
      ? "var(--color-warning)"
      : color;
  const dotClass = session.exited
    ? ""
    : activity === "attention"
      ? "dot-ring"
      : activity === "busy"
        ? "dot-glow"
        : "";
  const spark = sparkPath(readPulse(session.id, now), 44, 12);

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={() => {
          cancelPeek();
          const s = useApp.getState();
          s.setView("cli");
          s.selectSession(session.id);
        }}
        onMouseEnter={() => {
          peekTimer.current = window.setTimeout(() => {
            const rect = chipRef.current?.getBoundingClientRect();
            if (!rect) return;
            setPeekAt({
              top: Math.max(8, rect.top - PEEK_HEIGHT - 10),
              left: Math.max(8, Math.min(rect.left, window.innerWidth - PEEK_WIDTH - 8)),
            });
          }, PEEK_DELAY_MS);
        }}
        onMouseLeave={cancelPeek}
        title={session.title}
        className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3 transition ${
          active
            ? "bg-[var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-accent-dim)]"
            : "hover:bg-[var(--color-surface)]"
        } ${session.exited ? "opacity-60" : ""}`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
          style={{ backgroundColor: dotColor, color: dotColor }}
        />
        <span className="shrink-0" style={{ color }}>
          <Logo size={13} />
        </span>
        <span className="max-w-[88px] truncate text-[11.5px] text-[var(--color-text)]">
          {session.title}
        </span>
        <svg viewBox="0 0 44 12" className="h-[12px] w-[44px] shrink-0" aria-hidden>
          <path d="M0 11H44" stroke="var(--color-border)" strokeWidth={1} fill="none" />
          {spark && (
            <path
              d={spark}
              stroke={session.exited ? "var(--color-text-faint)" : color}
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </svg>
        {queuedCount > 0 && (
          <span
            className="shrink-0 rounded-full bg-[var(--color-surface-3)] px-1.5 font-mono text-[10px] leading-4 text-[var(--color-text-muted)]"
            title={`${queuedCount} prompt${queuedCount > 1 ? "s" : ""} queued`}
          >
            {queuedCount}
          </span>
        )}
      </button>
      {peekAt && <SessionPeek session={session} top={peekAt.top} left={peekAt.left} />}
    </>
  );
}

export function AgentDock() {
  const sessions = useApp((s) => s.sessions);
  const view = useApp((s) => s.view);
  const pulseOpen = useApp((s) => s.pulseOpen);
  const hasCli = useApp((s) => s.clis.some((c) => c.available));
  const waitingCount = useApp(
    (s) => s.sessions.filter((t) => s.activity[t.id] === "attention").length,
  );
  const [now, setNow] = useState(() => Date.now());

  // One shared ticker keeps every chip's heartbeat fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Chat brings its own bottom composer; Pulse already shows everything.
  if (sessions.length === 0 || pulseOpen || view === "chat") return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-4">
      <div className="pointer-events-auto glass-strong flex max-w-full items-center gap-1 rounded-full border border-[var(--glass-border)] py-1 pl-1.5 pr-1.5 shadow-[var(--shadow-pop)]">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {sessions.map((session) => (
            <DockChip key={session.id} session={session} now={now} />
          ))}
        </div>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--color-border)]" />
        {waitingCount > 0 && (
          <button
            type="button"
            onClick={() => useApp.getState().jumpToAttention()}
            title="Jump to the agent waiting on you (Ctrl+Shift+A)"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-warning-dim)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-warning)] transition hover:brightness-110"
          >
            <span
              className="dot-ring h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
              style={{ color: "var(--color-warning)" }}
            />
            {waitingCount} waiting
          </button>
        )}
        <button
          type="button"
          onClick={() => useApp.getState().setPulseOpen(true)}
          title="Pulse — every agent at a glance (Ctrl+Shift+O)"
          className={dockBtn}
        >
          <IconPulse size={15} />
        </button>
        <button
          type="button"
          onClick={() => useApp.getState().openModal({})}
          disabled={!hasCli}
          title="New session (Ctrl+Shift+T)"
          className={`${dockBtn} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <IconPlus size={15} />
        </button>
      </div>
    </div>
  );
}
