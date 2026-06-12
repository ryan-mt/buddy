// Pulse — the mission-control overlay (Ctrl+Shift+O): every agent on one
// board. Each card carries a live tail of the terminal, a two-minute
// heartbeat sparkline, and the session's state at a glance, so you can see
// who's grinding, who's stuck waiting on you, and who's done — without
// flipping through panes. Click a card to jump in.

import { useEffect, useState } from "react";
import { IconClose, IconPlus, IconPulse, IconRestart } from "../icons";
import { AGENT_COLOR, AGENT_LABEL, AGENT_LOGO } from "../../lib/agents";
import { readPulse, sparkPath } from "../../lib/pulse";
import { trackSpotlight } from "../../lib/spotlight";
import { readTail } from "../../lib/terminalRegistry";
import { basename, useApp } from "../../store";
import type { SessionTab } from "../../types";

type CardState = "waiting" | "working" | "quiet" | "exited";

const STATE_LABEL: Record<CardState, string> = {
  waiting: "needs you",
  working: "working",
  quiet: "quiet",
  exited: "exited",
};

const STATE_ORDER: Record<CardState, number> = {
  waiting: 0,
  working: 1,
  quiet: 2,
  exited: 3,
};

function stateColor(state: CardState): string {
  switch (state) {
    case "waiting":
      return "var(--color-warning)";
    case "working":
      return "var(--color-running)";
    case "quiet":
      return "var(--color-text-muted)";
    case "exited":
      return "var(--color-text-faint)";
  }
}

function uptimeLabel(startedAt: number, now: number): string {
  const mins = Math.floor((now - startedAt) / 60_000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const chip =
  "rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]";

function AgentCard({
  session,
  state,
  queuedCount,
  now,
  index,
}: {
  session: SessionTab;
  state: CardState;
  queuedCount: number;
  now: number;
  index: number;
}) {
  const Logo = AGENT_LOGO[session.cli];
  const color = AGENT_COLOR[session.cli];
  const tail = readTail(session.id, 9);
  const spark = sparkPath(readPulse(session.id, now), 120, 26);

  // selectSession also closes the overlay and acknowledges a waiting flag.
  const focus = () => {
    const s = useApp.getState();
    s.setView("cli");
    s.selectSession(session.id);
  };

  const dotClass =
    state === "waiting" ? "dot-ring" : state === "working" ? "dot-glow" : "";
  const dotColor = state === "exited" ? "var(--color-text-faint)" : color;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={focus}
      onKeyDown={(e) => {
        if (e.key === "Enter") focus();
      }}
      onPointerMove={trackSpotlight}
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
      title="Jump to this session"
      className={`glass glass-spot rise group flex cursor-pointer flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] ${
        state === "waiting"
          ? "border-[var(--color-warning)] bg-[var(--color-warning-dim)]"
          : "border-[var(--glass-border)]"
      } ${state === "exited" ? "opacity-75" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
          style={{ backgroundColor: dotColor, color: dotColor }}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {session.title}
        </span>
        <span
          className="shrink-0 text-[11px] font-medium"
          style={{ color: stateColor(state) }}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px]"
          style={{ color }}
        >
          <Logo size={11} />
          {AGENT_LABEL[session.cli]}
        </span>
        {session.model && <span className={chip}>{session.model}</span>}
        {session.startedAt && !session.exited && (
          <span className={chip} title="Session uptime">
            {uptimeLabel(session.startedAt, now)}
          </span>
        )}
        {queuedCount > 0 && (
          <span
            className="rounded-full bg-[var(--color-surface-3)] px-1.5 font-mono text-[10px] leading-4 text-[var(--color-text-muted)]"
            title={`${queuedCount} prompt${queuedCount > 1 ? "s" : ""} queued`}
          >
            {queuedCount} queued
          </span>
        )}
        {session.cwd && (
          <span className="min-w-0 truncate font-mono text-[10.5px] text-[var(--color-text-faint)]">
            {basename(session.cwd)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 120 26"
          preserveAspectRatio="none"
          className="h-[26px] min-w-0 flex-1"
          aria-hidden
        >
          <path
            d="M0 24.5H120"
            stroke="var(--color-border)"
            strokeWidth={1}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {spark && (
            <path
              d={spark}
              stroke={state === "exited" ? "var(--color-text-faint)" : color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-text-faint)]">
          2 min
        </span>
      </div>

      <div className="flex h-[118px] items-end overflow-hidden rounded-xl bg-[var(--color-term-well)] px-2.5 py-2">
        {tail ? (
          <pre className="w-full overflow-hidden whitespace-pre font-mono text-[10.5px] leading-[1.5] text-[#d9d2c0]">
            {tail}
          </pre>
        ) : (
          <span className="w-full self-center text-center text-[11px] text-[var(--color-text-faint)]">
            no output yet
          </span>
        )}
      </div>

      {session.exited && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useApp.getState().relaunch(session.id);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
          >
            <IconRestart size={13} />
            {session.cli === "claude" ? "Resume" : "Relaunch"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              useApp.getState().closeSession(session.id);
            }}
            className="rounded-lg px-2.5 py-1 text-[12px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            Close
          </button>
          {session.exitCode ? (
            <span className="ml-auto font-mono text-[10.5px] text-[var(--color-danger)]">
              code {session.exitCode}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function PulsePanel() {
  const sessions = useApp((s) => s.sessions);
  const activity = useApp((s) => s.activity);
  const queued = useApp((s) => s.queued);
  const [now, setNow] = useState(() => Date.now());

  // One shared ticker refreshes tails, sparklines and uptimes together.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Esc closes the overlay — capture phase, but yield to anything stacked above.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useApp.getState();
      if (
        s.modal ||
        s.settingsOpen ||
        s.paletteOpen ||
        s.shortcutsOpen ||
        s.installOpen ||
        s.confirmCloseId ||
        s.profileModal
      )
        return;
      s.setPulseOpen(false);
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const stateOf = (t: SessionTab): CardState =>
    t.exited
      ? "exited"
      : activity[t.id] === "attention"
        ? "waiting"
        : activity[t.id] === "busy"
          ? "working"
          : "quiet";

  const sorted = [...sessions].sort(
    (a, b) => STATE_ORDER[stateOf(a)] - STATE_ORDER[stateOf(b)],
  );
  const counts = sorted.reduce(
    (acc, t) => {
      acc[stateOf(t)]++;
      return acc;
    },
    { waiting: 0, working: 0, quiet: 0, exited: 0 } as Record<CardState, number>,
  );

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--glass-border)] px-4 py-3">
        <span className="text-[var(--color-accent)]">
          <IconPulse size={17} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold leading-tight tracking-tight">Pulse</div>
          <div className="text-[11px] leading-tight text-[var(--color-text-faint)]">
            every agent at a glance
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(Object.keys(STATE_ORDER) as CardState[]).map(
            (state) =>
              counts[state] > 0 && (
                <span
                  key={state}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px]"
                  style={{ color: stateColor(state) }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: stateColor(state) }}
                  />
                  {counts[state]} {STATE_LABEL[state]}
                </span>
              ),
          )}
        </div>
        <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)]">
          esc
        </kbd>
        <button
          type="button"
          onClick={() => useApp.getState().setPulseOpen(false)}
          title="Close Pulse"
          className="rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <IconClose size={16} />
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[13px] text-[var(--color-text-faint)]">
          <IconPulse size={28} className="text-[var(--color-text-faint)]" />
          Nothing to watch yet.
          <button
            type="button"
            onClick={() => useApp.getState().openModal({})}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110"
          >
            <IconPlus size={15} /> New session
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-3">
            {sorted.map((session, i) => (
              <AgentCard
                key={session.id}
                session={session}
                state={stateOf(session)}
                queuedCount={queued[session.id]?.length ?? 0}
                now={now}
                index={i}
              />
            ))}
          </div>
          <p className="px-1 pb-1 pt-4 text-center text-[11px] text-[var(--color-text-faint)]">
            Click a card to jump in · waiting agents sort first
          </p>
        </div>
      )}
    </div>
  );
}
