import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import {
  IconBroadcast,
  IconClose,
  IconCode,
  IconCollapse,
  IconDiff,
  IconDownload,
  IconExpand,
  IconSearch,
  IconSend,
  IconSplitDown,
  IconSplitRight,
} from "../icons";
import { AGENT_COLOR, AGENT_LABEL, AGENT_LOGO } from "../../lib/agents";
import { api } from "../../lib/bindings";
import { ChatHeader } from "../chat/ChatHeader";
import { readScrollback } from "../../lib/terminalRegistry";
import { basename, errorMessage, useApp } from "../../store";

const headerBtn =
  "rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";

/** Save the active pane's scrollback as a .txt via the system save dialog. */
async function exportScrollback(sessionId: string, title: string) {
  const { pushToast } = useApp.getState();
  const text = readScrollback(sessionId);
  if (!text) {
    pushToast("Nothing to export yet", "error");
    return;
  }
  const safe = title.replace(/[\\/:*?"<>|]/g, "-").trim() || "session";
  try {
    const path = await save({
      defaultPath: `${safe}.txt`,
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (!path) return;
    await api.writeFile(path, text);
    pushToast(`Saved ${path}`);
  } catch (e) {
    pushToast(errorMessage(e), "error");
  }
}

/** Session uptime, ticking every half-minute ("3m", "1h 12m"). */
function Uptime({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((Date.now() - startedAt) / 60_000);
  const label = mins < 1 ? "<1m" : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return (
    <span
      title="Session uptime"
      className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]"
    >
      {label}
    </span>
  );
}

/** Double-click-to-rename session title. */
function SessionTitle({ id, title }: { id: string; title: string }) {
  const renameSession = useApp((s) => s.renameSession);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(title);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, title]);

  if (!editing) {
    return (
      <button
        type="button"
        onDoubleClick={() => setEditing(true)}
        title="Double-click to rename"
        className="cursor-text truncate text-[13px] font-medium"
      >
        {title}
      </button>
    );
  }
  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        renameSession(id, draft);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          renameSession(id, draft);
          setEditing(false);
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="w-48 rounded-md border border-[var(--color-accent-dim)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[13px] font-medium outline-none"
    />
  );
}

export function MainHeader() {
  const view = useApp((s) => s.view);
  const sessions = useApp((s) => s.sessions);
  const activeId = useApp((s) => s.activeId);
  const layout = useApp((s) => s.layout);
  const zoomedId = useApp((s) => s.zoomedId);
  const workspace = useApp((s) => s.workspace);
  const closeWorkspace = useApp((s) => s.closeWorkspace);
  const openModal = useApp((s) => s.openModal);
  const toggleZoom = useApp((s) => s.toggleZoom);
  const searchOpen = useApp((s) => s.searchOpen);
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  const broadcast = useApp((s) => s.broadcast);
  const toggleBroadcast = useApp((s) => s.toggleBroadcast);
  const activeActivity = useApp((s) => (s.activeId ? s.activity[s.activeId] : undefined));

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const ActiveLogo = activeSession ? AGENT_LOGO[activeSession.cli] : null;
  const isSplit = layout?.kind === "split";

  return (
    <header className="glass flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--glass-border)] px-4">
      {view === "chat" ? (
        <ChatHeader />
      ) : workspace ? (
        <>
          <span className="text-[var(--color-accent)]">
            <IconCode size={15} />
          </span>
          <span className="text-[13px] font-medium">{workspace.rootName}</span>
          <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
            editor
          </span>
          <span className="ml-auto truncate pl-4 font-mono text-[11px] text-[var(--color-text-faint)]">
            {workspace.rootPath}
          </span>
          <button
            type="button"
            onClick={() => useApp.getState().openDiff(workspace)}
            title="View git changes (Ctrl+Shift+G)"
            className={`ml-3 ${headerBtn}`}
          >
            <IconDiff size={16} />
          </button>
          <button
            type="button"
            onClick={closeWorkspace}
            title="Close workspace"
            className={headerBtn}
          >
            <IconClose size={16} />
          </button>
        </>
      ) : activeSession ? (
        <>
          <span
            className={`h-2 w-2 rounded-full ${
              !activeSession.exited && activeActivity === "busy" ? "dot-glow" : ""
            }`}
            style={{
              backgroundColor: activeSession.exited
                ? "var(--color-text-faint)"
                : AGENT_COLOR[activeSession.cli],
              color: AGENT_COLOR[activeSession.cli],
            }}
          />
          <SessionTitle id={activeSession.id} title={activeSession.title} />
          {ActiveLogo && (
            <span
              className="flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px]"
              style={{ color: AGENT_COLOR[activeSession.cli] }}
            >
              <ActiveLogo size={11} />
              {AGENT_LABEL[activeSession.cli]}
            </span>
          )}
          {activeSession.model && (
            <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              {activeSession.model}
            </span>
          )}
          {activeSession.effort && (
            <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              {activeSession.effort}
            </span>
          )}
          {activeSession.startedAt && !activeSession.exited && (
            <Uptime key={activeSession.id} startedAt={activeSession.startedAt} />
          )}
          {activeSession.exited ? (
            <span className="text-[11px] text-[var(--color-text-faint)]">exited</span>
          ) : (
            activeActivity === "busy" && (
              <span className="text-[11px] text-[var(--color-running)]">working…</span>
            )
          )}
          <span className="ml-auto truncate pl-4 font-mono text-[11px] text-[var(--color-text-faint)]">
            {activeSession.cwd ?? "~"}
          </span>
          <div className="flex items-center gap-0.5 pl-3">
            {activeSession.cwd && (
              <button
                type="button"
                onClick={() =>
                  useApp.getState().openDiff({
                    rootPath: activeSession.cwd!,
                    rootName: basename(activeSession.cwd!),
                  })
                }
                title="View git changes (Ctrl+Shift+G)"
                className={headerBtn}
              >
                <IconDiff size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              title="Find in terminal (Ctrl+K)"
              className={headerBtn}
            >
              <IconSearch size={16} />
            </button>
            <button
              type="button"
              onClick={() => useApp.getState().setComposerOpen(true)}
              title="Prompt composer (Ctrl+Shift+P)"
              className={headerBtn}
            >
              <IconSend size={16} />
            </button>
            <button
              type="button"
              onClick={() => void exportScrollback(activeSession.id, activeSession.title)}
              title="Export scrollback to a text file"
              className={headerBtn}
            >
              <IconDownload size={16} />
            </button>
            {isSplit && (
              <button
                type="button"
                onClick={toggleBroadcast}
                title={
                  broadcast
                    ? "Broadcast on — typing reaches every pane (Ctrl+Shift+B)"
                    : "Broadcast keystrokes to all panes (Ctrl+Shift+B)"
                }
                className={
                  broadcast
                    ? "rounded-md bg-[var(--color-surface-2)] p-1.5 text-[var(--color-accent)] transition"
                    : headerBtn
                }
              >
                <IconBroadcast size={16} />
              </button>
            )}
            {(isSplit || zoomedId) && (
              <button
                type="button"
                onClick={toggleZoom}
                title={zoomedId ? "Restore panes (Ctrl+Shift+Z)" : "Zoom pane (Ctrl+Shift+Z)"}
                className={headerBtn}
              >
                {zoomedId ? <IconCollapse size={16} /> : <IconExpand size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                openModal({
                  cwd: activeSession.cwd,
                  splitDir: "row",
                  splitTarget: activeSession.id,
                })
              }
              title="Split right (new session)"
              className={headerBtn}
            >
              <IconSplitRight size={16} />
            </button>
            <button
              type="button"
              onClick={() =>
                openModal({
                  cwd: activeSession.cwd,
                  splitDir: "col",
                  splitTarget: activeSession.id,
                })
              }
              title="Split down (new session)"
              className={headerBtn}
            >
              <IconSplitDown size={16} />
            </button>
          </div>
        </>
      ) : (
        <span className="text-[13px] text-[var(--color-text-faint)]">No session</span>
      )}
    </header>
  );
}
