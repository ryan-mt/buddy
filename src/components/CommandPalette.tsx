// The command palette (Ctrl+Shift+K): one fuzzy-searchable list over actions,
// open sessions, projects, and formations. Ranking lives in lib/palette.ts;
// this component only assembles entries from the store and renders the glass
// sheet with keyboard navigation.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, basename } from "../store";
import { rankEntries, type PaletteEntry } from "../lib/palette";
import { THEMES, nextTheme, themeInfo } from "../lib/theme";
import {
  IconFolder,
  IconFormation,
  IconSearch,
  IconSettings,
  IconSun,
  IconTerminal,
} from "./icons";
import { AGENT_COLOR } from "../lib/agents";

/** Section → row icon. Sessions get their CLI's accent color separately. */
const SECTION_ICON: Record<string, React.ReactNode> = {
  Actions: <IconSettings size={13} />,
  Sessions: <IconTerminal size={13} />,
  Projects: <IconFolder size={13} />,
  Formations: <IconFormation size={13} />,
  Themes: <IconSun size={13} />,
};

function buildEntries(): PaletteEntry[] {
  const s = useApp.getState();
  const entries: PaletteEntry[] = [];

  // Sessions first: switching is the most frequent reach.
  for (const tab of s.sessions) {
    entries.push({
      id: `session:${tab.id}`,
      label: tab.title,
      hint: `${tab.cli} ${tab.cwd ?? ""}${tab.exited ? " exited" : ""}`,
      section: "Sessions",
      run: () => s.selectSession(tab.id),
    });
  }

  const active = s.sessions.find((t) => t.id === s.activeId);
  const acts: (PaletteEntry | false)[] = [
    s.clis.some((c) => c.available) && {
      id: "act:new",
      label: "New session…",
      hint: "launch start terminal",
      section: "Actions",
      run: () => s.openModal({}),
    },
    {
      id: "act:chat",
      label: s.view === "chat" ? "Back to terminals" : "Open chat",
      hint: "view toggle",
      section: "Actions",
      run: () => s.setView(s.view === "chat" ? "cli" : "chat"),
    },
    !!active && {
      id: "act:find",
      label: "Find in terminal",
      hint: "search scrollback",
      section: "Actions",
      run: () => s.setSearchOpen(true),
    },
    !!active && {
      id: "act:close",
      label: `Close session: ${active.title}`,
      hint: "kill end",
      section: "Actions",
      run: () => s.requestClose(active.id),
    },
    s.layout?.kind === "split" && {
      id: "act:zoom",
      label: s.zoomedId ? "Unzoom pane" : "Zoom pane",
      hint: "focus fullscreen",
      section: "Actions",
      run: () => s.toggleZoom(),
    },
    s.layout?.kind === "split" && {
      id: "act:broadcast",
      label: s.broadcast ? "Broadcast off" : "Broadcast keystrokes",
      hint: "all panes input",
      section: "Actions",
      run: () => s.toggleBroadcast(),
    },
    s.sessions.some((t) => !t.exited) && {
      id: "act:composer",
      label: "Prompt composer",
      hint: "queue send snippet",
      section: "Actions",
      run: () => s.setComposerOpen(true),
    },
    s.sessions.length > 0 && {
      id: "act:pulse",
      label: "Pulse — every agent at a glance",
      hint: "overview mission control monitor live",
      section: "Actions",
      run: () => s.setPulseOpen(true),
    },
    s.sessions.some((t) => s.activity[t.id] === "attention") && {
      id: "act:attention",
      label: "Jump to waiting agent",
      hint: "needs you attention input",
      section: "Actions",
      run: () => s.jumpToAttention(),
    },
    {
      id: "act:theme",
      label: `Next theme (${themeInfo(nextTheme(s.theme)).label})`,
      hint: "appearance cycle palette",
      section: "Actions",
      run: () => s.cycleTheme(),
    },
    {
      id: "act:settings",
      label: "Settings",
      hint: "preferences options",
      section: "Actions",
      run: () => s.setSettingsOpen(true),
    },
    {
      id: "act:shortcuts",
      label: "Keyboard shortcuts",
      hint: "cheatsheet keys bindings help",
      section: "Actions",
      run: () => s.setShortcutsOpen(true),
    },
    {
      id: "act:sidebar",
      label: s.settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar to rail",
      hint: "rail toggle narrow",
      section: "Actions",
      run: () => s.toggleSidebar(),
    },
    {
      id: "act:pin",
      label: s.alwaysOnTop ? "Unpin window" : "Pin window on top",
      hint: "always float above",
      section: "Actions",
      run: () => s.toggleAlwaysOnTop(),
    },
    {
      id: "act:install",
      label: "Install CLIs…",
      hint: "claude codex gemini setup",
      section: "Actions",
      run: () => s.setInstallOpen(true),
    },
    {
      id: "act:updates",
      label: "Check for CLI updates",
      hint: "upgrade version",
      section: "Actions",
      run: () => void s.checkCliUpdates(false),
    },
    {
      id: "act:export",
      label: "Export backup…",
      hint: "save settings formations snippets",
      section: "Actions",
      run: () => void s.exportBackup(),
    },
    {
      id: "act:import",
      label: "Import backup…",
      hint: "restore settings formations snippets",
      section: "Actions",
      run: () => void s.importBackup(),
    },
  ];
  // Git changes mirrors the Ctrl+Shift+G target: workspace, else active cwd.
  const gitTarget =
    s.workspace ?? (active?.cwd ? { rootPath: active.cwd, rootName: basename(active.cwd) } : null);
  if (gitTarget) {
    acts.push({
      id: "act:git",
      label: `Git changes: ${gitTarget.rootName}`,
      hint: "diff status",
      section: "Actions",
      run: () => s.openDiff(gitTarget),
    });
  }
  for (const a of acts) if (a) entries.push(a);

  for (const p of s.projects) {
    entries.push({
      id: `proj-open:${p.id}`,
      label: `Open workspace: ${p.name}`,
      hint: `project editor ${p.path}`,
      section: "Projects",
      run: () => s.openWorkspace(p),
    });
    if (s.clis.some((c) => c.available)) {
      entries.push({
        id: `proj-launch:${p.id}`,
        label: `New session in ${p.name}`,
        hint: `project launch ${p.path}`,
        section: "Projects",
        run: () => s.openModal({ cwd: p.path }),
      });
    }
  }

  for (const f of s.formations) {
    entries.push({
      id: `formation:${f.id}`,
      label: `Launch formation: ${f.name}`,
      hint: `squad layout ${f.slots.map((slot) => slot.cli).join(" ")}`,
      section: "Formations",
      run: () => s.launchFormation(f.id),
    });
  }

  for (const t of THEMES) {
    if (t.id === s.theme) continue;
    entries.push({
      id: `theme:${t.id}`,
      label: `Theme: ${t.label}`,
      hint: `${t.blurb} ${t.mode} palette appearance`,
      section: "Themes",
      run: () => s.setTheme(t.id),
    });
  }

  return entries;
}

/** Label with the fuzzy-matched characters tinted accent. */
function Highlighted({ text, positions }: { text: string; positions: number[] }) {
  if (!positions.length) return <>{text}</>;
  const marks = new Set(positions);
  return (
    <>
      {Array.from(text, (ch, i) =>
        marks.has(i) ? (
          <span key={i} className="font-semibold text-[var(--color-accent)]">
            {ch}
          </span>
        ) : (
          ch
        ),
      )}
    </>
  );
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Entries snapshot when opening (state can't change while the palette has focus).
  const entries = useMemo(() => (open ? buildEntries() : []), [open]);
  const ranked = useMemo(() => rankEntries(entries, query), [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  const close = () => useApp.getState().setPaletteOpen(false);
  const runSelected = (index: number) => {
    const hit = ranked[index];
    if (!hit) return;
    close();
    hit.entry.run();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px] animate-[fadeIn_120ms_ease-out]"
      onPointerDown={close}
    >
      <div
        className="glass-strong absolute left-1/2 top-[14%] w-[580px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--glass-border)] animate-[popIn_180ms_var(--ease-natural)]"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-[var(--color-text-faint)]">
            <IconSearch size={15} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                setSelected((i) => Math.min(i + 1, ranked.length - 1));
                e.preventDefault();
              } else if (e.key === "ArrowUp") {
                setSelected((i) => Math.max(i - 1, 0));
                e.preventDefault();
              } else if (e.key === "Enter") {
                runSelected(selected);
                e.preventDefault();
              } else if (e.key === "Escape") {
                close();
                e.preventDefault();
              }
            }}
            placeholder="Search sessions, actions, projects…"
            className="flex-1 bg-transparent text-[14px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
          />
          <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)]">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {ranked.length === 0 && (
            <div className="px-3 py-6 text-center text-[13px] text-[var(--color-text-faint)]">
              Nothing matches “{query}”
            </div>
          )}
          {ranked.map(({ entry, positions }, i) => {
            const sessionTab =
              entry.section === "Sessions"
                ? useApp.getState().sessions.find((t) => `session:${t.id}` === entry.id)
                : undefined;
            return (
              <button
                key={entry.id}
                type="button"
                data-index={i}
                onClick={() => runSelected(i)}
                onPointerMove={() => setSelected(i)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  i === selected
                    ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                <span
                  className="shrink-0"
                  style={
                    sessionTab ? { color: AGENT_COLOR[sessionTab.cli] } : undefined
                  }
                >
                  {SECTION_ICON[entry.section]}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <Highlighted text={entry.label} positions={positions} />
                </span>
                {sessionTab?.exited && (
                  <span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">exited</span>
                )}
                <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">
                  {entry.section}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
