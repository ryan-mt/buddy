// A live glimpse of a session's terminal, floated near its anchor (sidebar
// row or dock chip). Portaled to <body> so overflow/backdrop-filter ancestors
// can't clip it; pointer-events: none so it never steals the hover.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AGENT_COLOR } from "../../lib/agents";
import { readTail } from "../../lib/terminalRegistry";
import { useApp } from "../../store";
import type { SessionTab } from "../../types";

/** How long the cursor must rest on an anchor before the peek appears. */
export const PEEK_DELAY_MS = 350;
export const PEEK_HEIGHT = 192;
export const PEEK_WIDTH = 380;

export function SessionPeek({
  session,
  top,
  left,
}: {
  session: SessionTab;
  top: number;
  left: number;
}) {
  const activity = useApp((s) => s.activity[session.id]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const tail = readTail(session.id, 10);
  const state = session.exited
    ? "exited"
    : activity === "attention"
      ? "needs you"
      : activity === "busy"
        ? "working"
        : "quiet";
  return createPortal(
    <div className="pointer-events-none fixed z-40 w-[380px]" style={{ top, left }}>
      <div className="glass-strong overflow-hidden rounded-xl border border-[var(--glass-border)] shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: session.exited
                ? "var(--color-text-faint)"
                : AGENT_COLOR[session.cli],
            }}
          />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{session.title}</span>
          <span className="shrink-0 text-[10.5px] text-[var(--color-text-faint)]">{state}</span>
        </div>
        <div className="flex h-[150px] items-end overflow-hidden bg-[var(--color-term-well)] px-2.5 py-2">
          {tail ? (
            <pre className="w-full overflow-hidden whitespace-pre font-mono text-[10px] leading-[1.5] text-[#d9d2c0]">
              {tail}
            </pre>
          ) : (
            <span className="w-full self-center text-center text-[11px] text-[var(--color-text-faint)]">
              no output yet
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
