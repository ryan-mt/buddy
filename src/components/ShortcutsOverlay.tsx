// The shortcut cheatsheet (Ctrl+Shift+/): every chord on one glass sheet,
// grouped by what it touches. Data-driven so the list stays honest — add a
// binding in App.tsx, add a row here.

import { useEffect } from "react";
import { IconKeyboard } from "./icons";
import { useApp } from "../store";

interface Row {
  keys: string[];
  label: string;
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Everywhere",
    rows: [
      { keys: ["Ctrl", "Shift", "K"], label: "Command palette" },
      { keys: ["Ctrl", "Shift", "/"], label: "This cheatsheet" },
      { keys: ["Ctrl", "Shift", "S"], label: "Collapse / expand sidebar" },
      { keys: ["Ctrl", "Shift", "C"], label: "Chat view on / off" },
      { keys: ["Ctrl", "Shift", ","], label: "Settings" },
    ],
  },
  {
    title: "Sessions",
    rows: [
      { keys: ["Ctrl", "Shift", "T"], label: "New session" },
      { keys: ["Ctrl", "Shift", "W"], label: "Close session" },
      { keys: ["Ctrl", "Shift", "1–9"], label: "Jump to session 1–9" },
      { keys: ["Ctrl", "Shift", "] ["], label: "Next / previous session" },
      { keys: ["Ctrl", "Shift", "A"], label: "Jump to the waiting agent" },
      { keys: ["Ctrl", "Shift", "O"], label: "Pulse — all agents at a glance" },
    ],
  },
  {
    title: "Panes",
    rows: [
      { keys: ["Ctrl", "Shift", "Z"], label: "Zoom / restore pane" },
      { keys: ["Ctrl", "Shift", "B"], label: "Broadcast keystrokes to all panes" },
      { keys: ["Ctrl", "Shift", "P"], label: "Prompt composer (queue & send)" },
    ],
  },
  {
    title: "Tools",
    rows: [
      { keys: ["Ctrl", "K"], label: "Find in terminal" },
      { keys: ["Ctrl", "Shift", "F"], label: "Find in terminal (alternate)" },
      { keys: ["Ctrl", "Shift", "G"], label: "Git changes for this folder" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--color-text-muted)]">
      {children}
    </kbd>
  );
}

export function ShortcutsOverlay() {
  const open = useApp((s) => s.shortcutsOpen);

  // Esc closes just the cheatsheet — capture phase beats the overlays below.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      useApp.getState().setShortcutsOpen(false);
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  const close = () => useApp.getState().setShortcutsOpen(false);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px] animate-[fadeIn_120ms_ease-out]"
      onPointerDown={close}
    >
      <div
        className="glass-strong absolute left-1/2 top-1/2 max-h-[82vh] w-[640px] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--glass-border)] animate-[popIn_180ms_var(--ease-natural)]"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border-soft)] px-5 py-3.5">
          <span className="text-[var(--color-accent)]">
            <IconKeyboard size={17} />
          </span>
          <span className="font-display text-[16px] font-semibold tracking-tight">
            Shortcuts
          </span>
          <kbd className="ml-auto rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-faint)]">
            esc
          </kbd>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
          {GROUPS.map((group, gi) => (
            <section key={group.title} className="rise" style={{ animationDelay: `${gi * 45}ms` }}>
              <h3 className="pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.rows.map((row) => (
                  <li key={row.label} className="flex items-center gap-3">
                    <span className="flex shrink-0 items-center gap-1">
                      {row.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-text-muted)]">
                      {row.label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
