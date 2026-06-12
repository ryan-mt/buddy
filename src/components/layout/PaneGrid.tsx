import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "../terminal/Terminal";
import { SplitDividers } from "./SplitDividers";
import { IconRestart } from "../icons";
import { computeLayout, type Rect } from "../../lib/layout";
import { registerScrollback, unregisterScrollback } from "../../lib/terminalRegistry";
import { useApp } from "../../store";

const GUTTER = 6;

/** Keystroke buffers for auto-titling a session from its first typed prompt. */
const promptBuffers = new Map<string, string>();

function trackFirstPrompt(id: string, data: string) {
  const s = useApp.getState();
  const tab = s.sessions.find((t) => t.id === id);
  if (!tab?.titleAuto) {
    promptBuffers.delete(id);
    return;
  }
  // Escape sequences mean menu navigation, not prompt typing — start over.
  if (data.includes("\x1b")) {
    promptBuffers.set(id, "");
    return;
  }
  let buf = promptBuffers.get(id) ?? "";
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      const title = buf.trim();
      buf = "";
      if (title.length >= 4) {
        promptBuffers.delete(id);
        s.autoTitle(id, title);
        return;
      }
      continue; // a bare Enter (confirm dialog) — keep waiting for a real line
    }
    if (ch === "\x7f" || ch === "\b") buf = buf.slice(0, -1);
    else if (ch >= " ") buf += ch;
  }
  promptBuffers.set(id, buf.slice(0, 200));
}

/**
 * The split grid of terminal panes. Terminals are mounted once (keyed by
 * session id) and only repositioned by rect, so a layout change never remounts
 * a PTY. Panes that aren't in the visible layout (or are hidden behind a
 * zoomed pane) stay mounted with `display: none`.
 */
export function PaneGrid({ hidden }: { hidden: boolean }) {
  const sessions = useApp((s) => s.sessions);
  const layout = useApp((s) => s.layout);
  const activeId = useApp((s) => s.activeId);
  const zoomedId = useApp((s) => s.zoomedId);
  const searchOpen = useApp((s) => s.searchOpen);
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  const setActive = useApp((s) => s.selectSession);
  const resizeSplit = useApp((s) => s.resizeSplit);
  const settings = useApp((s) => s.settings);
  const activity = useApp((s) => s.activity);
  const broadcast = useApp((s) => s.broadcast);

  const boxRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const { panes, dividers } = useMemo(() => {
    if (!layout || boxSize.w === 0 || boxSize.h === 0) {
      return { panes: [], dividers: [] };
    }
    return computeLayout(layout, { x: 0, y: 0, w: boxSize.w, h: boxSize.h }, GUTTER);
  }, [layout, boxSize]);

  const rectBySession = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const p of panes) map.set(p.sessionId, p.rect);
    return map;
  }, [panes]);

  const isSplit = panes.length > 1;
  const zoomed = zoomedId && rectBySession.has(zoomedId) ? zoomedId : null;

  return (
    <div ref={boxRef} className="absolute inset-2" style={hidden ? { display: "none" } : undefined}>
      {sessions.map((session) => {
        let rect = rectBySession.get(session.id);
        if (zoomed) {
          rect = session.id === zoomed ? { x: 0, y: 0, w: boxSize.w, h: boxSize.h } : undefined;
        }
        const focused = isSplit && !zoomed && session.id === activeId;
        // Ring priority: a pane asking for attention beats the focus ring,
        // which beats the soft "broadcast is live" tint on every pane.
        const ring =
          activity[session.id] === "attention"
            ? "inset 0 0 0 1px var(--color-warning)"
            : focused
              ? "inset 0 0 0 1px var(--color-accent-dim)"
              : broadcast && isSplit
                ? "inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent)"
                : undefined;
        return (
          <div
            key={session.id}
            onPointerDown={() => {
              if (session.id !== activeId) setActive(session.id);
            }}
            className="absolute overflow-hidden rounded-xl bg-[var(--color-term-well)]"
            style={
              rect
                ? {
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    boxShadow: ring,
                  }
                : { display: "none" }
            }
          >
            <div className="h-full w-full p-1.5">
              <Terminal
                cli={session.cli}
                cwd={session.cwd}
                model={session.model}
                permissionMode={session.permissionMode}
                effort={session.effort}
                profileId={session.profileId}
                title={session.title}
                resumeId={session.resumeId}
                fontSize={settings.terminalFontSize}
                cursorStyle={settings.terminalCursorStyle}
                cursorBlink={settings.terminalCursorBlink}
                scrollback={settings.terminalScrollback}
                copyOnSelect={settings.terminalCopyOnSelect}
                searchOpen={searchOpen && session.id === activeId}
                onCloseSearch={() => setSearchOpen(false)}
                onExit={(code) => useApp.getState().markExited(session.id, code)}
                onReady={(ptyId) => useApp.getState().setPtyId(session.id, ptyId)}
                onOutput={() => useApp.getState().reportOutput(session.id)}
                onBell={() => useApp.getState().reportBell(session.id)}
                interceptData={(data) => {
                  trackFirstPrompt(session.id, data);
                  const s = useApp.getState();
                  if (!s.broadcast) return false;
                  s.broadcastWrite(data);
                  return true;
                }}
                registerScrollback={(read) => {
                  if (read) registerScrollback(session.id, read);
                  else unregisterScrollback(session.id);
                }}
              />
            </div>
            {session.exited && (
              // Floating revival bar — the scrollback above stays readable.
              <div className="glass-strong absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--glass-border)] py-1.5 pl-3.5 pr-1.5">
                <span className="whitespace-nowrap text-[12px] text-[var(--color-text-muted)]">
                  {session.exitCode ? (
                    <>
                      exited with code{" "}
                      <span className="font-mono text-[var(--color-danger)]">
                        {session.exitCode}
                      </span>
                    </>
                  ) : (
                    "session ended"
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => useApp.getState().relaunch(session.id)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
                  >
                    <IconRestart size={13} />
                    {session.cli === "claude" ? "Resume" : "Relaunch"}
                  </button>
                  <button
                    type="button"
                    onClick={() => useApp.getState().closeSession(session.id)}
                    className="rounded-lg px-2.5 py-1 text-[12px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {isSplit && !zoomed && <SplitDividers dividers={dividers} onResize={resizeSplit} />}
    </div>
  );
}
