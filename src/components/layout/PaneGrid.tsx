import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "../terminal/Terminal";
import { SplitDividers } from "./SplitDividers";
import { computeLayout, type Rect } from "../../lib/layout";
import { useApp } from "../../store";

const GUTTER = 6;

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
  const markExited = useApp((s) => s.markExited);
  const resizeSplit = useApp((s) => s.resizeSplit);
  const fontSize = useApp((s) => s.settings.terminalFontSize);

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
                    boxShadow: focused ? "inset 0 0 0 1px var(--color-accent-dim)" : undefined,
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
                fontSize={fontSize}
                searchOpen={searchOpen && session.id === activeId}
                onCloseSearch={() => setSearchOpen(false)}
                onExit={() => markExited(session.id)}
              />
            </div>
          </div>
        );
      })}
      {isSplit && !zoomed && <SplitDividers dividers={dividers} onResize={resizeSplit} />}
    </div>
  );
}
