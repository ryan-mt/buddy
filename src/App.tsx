import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  IconClose,
  IconCode,
  IconDownload,
  IconFolder,
  IconHistory,
  IconMoon,
  IconPlus,
  IconProfiles,
  IconSettings,
  IconSplitDown,
  IconSplitRight,
  IconSun,
  IconTerminal,
} from "./components/icons";
import { Logo } from "./components/Logo";
import { Terminal } from "./components/terminal/Terminal";
import { SegmentedControl } from "./components/layout/SegmentedControl";
import { SplitDividers } from "./components/layout/SplitDividers";
import { SessionList } from "./components/sessions/SessionList";
import { HistoryPanel } from "./components/sessions/HistoryPanel";
import { TranscriptViewer } from "./components/sessions/TranscriptViewer";
import { NewSessionModal, type NewSessionConfig } from "./components/sessions/NewSessionModal";
import { InstallModal } from "./components/sessions/InstallModal";
import { ProjectsPanel } from "./components/projects/ProjectsPanel";
import { ProfilesPanel } from "./components/profiles/ProfilesPanel";
import { ProfileModal } from "./components/profiles/ProfileModal";
import { SettingsModal } from "./components/SettingsModal";

const Workspace = lazy(() => import("./components/editor/Workspace"));
import {
  api,
  type CliInfo,
  type Profile,
  type ProfileInput,
  type ResumableSession,
  type SessionRecord,
} from "./lib/bindings";
import { AGENT_COLOR, AGENT_LABEL, AGENT_LOGO } from "./lib/agents";
import { applyTheme, getInitialTheme, type Theme } from "./lib/theme";
import { getInitialSettings, saveSettings, type Settings } from "./lib/settings";
import {
  computeLayout,
  firstLeaf,
  hasLeaf,
  leaf,
  removeLeaf,
  setRatio,
  splitLeaf,
  type Dir,
  type PaneNode,
  type Rect,
} from "./lib/layout";
import type { Project, SessionTab, SidebarView } from "./types";

const GUTTER = 6;

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

interface ModalContext {
  cwd?: string;
  title?: string;
  profileId?: string;
  /** When set, the launched session splits this pane instead of replacing the view. */
  splitDir?: Dir;
  splitTarget?: string;
}

export default function App() {
  const [clis, setClis] = useState<CliInfo[]>([]);
  const [clisError, setClisError] = useState<string | null>(null);
  const [view, setView] = useState<SidebarView>("cli");
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [layout, setLayout] = useState<PaneNode | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalContext | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [profileModal, setProfileModal] = useState<{ editing: Profile | null } | null>(null);
  const [workspace, setWorkspace] = useState<{ rootPath: string; rootName: string } | null>(null);
  const [transcript, setTranscript] = useState<SessionRecord | null>(null);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [settings, setSettings] = useState<Settings>(getInitialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const setThemeChecked = useCallback((next: Theme) => {
    applyTheme(next);
    setTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeChecked(theme === "dark" ? "light" : "dark");
  }, [theme, setThemeChecked]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const boxRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  const refreshClis = useCallback(async () => {
    try {
      setClis(await api.listClis());
      setClisError(null);
    } catch (e) {
      setClisError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refreshClis();
  }, [refreshClis]);

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch {
      // leave the list as-is if the DB read fails
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const refreshProfiles = useCallback(async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch {
      // leave the list as-is if the DB read fails
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api.listSessions());
    } catch {
      // leave the list as-is if the DB read fails
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  // Keep history fresh whenever it's brought into view (covers sessions the
  // backend recorded since the last look without polling).
  useEffect(() => {
    if (view === "history") void refreshHistory();
  }, [view, refreshHistory]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const availableClis = useMemo(() => clis.filter((c) => c.available), [clis]);
  const hasCli = availableClis.length > 0;

  // Add a session tab to the UI (optionally splitting a pane), focus it, and
  // refresh history once the backend has recorded it.
  const spawnSession = useCallback(
    (tab: SessionTab, split: { dir: Dir; target: string } | null) => {
      setSessions((prev) => [...prev, tab]);
      setLayout((prev) =>
        split && prev && hasLeaf(prev, split.target)
          ? splitLeaf(prev, split.target, split.dir, tab.id, crypto.randomUUID())
          : leaf(tab.id),
      );
      setActiveId(tab.id);
      setModal(null);
      setWorkspace(null);
      setTranscript(null);
    },
    [],
  );

  const handleLaunch = useCallback(
    (config: NewSessionConfig) => {
      const split =
        modal?.splitDir && modal.splitTarget
          ? { dir: modal.splitDir, target: modal.splitTarget }
          : null;
      const title =
        modal?.title ?? (config.cwd ? basename(config.cwd) : `Session ${sessions.length + 1}`);
      spawnSession(
        {
          id: crypto.randomUUID(),
          title,
          cli: config.cli,
          cwd: config.cwd,
          model: config.model,
          permissionMode: config.permissionMode,
          effort: config.effort,
          profileId: config.profileId,
          exited: false,
        },
        split,
      );
    },
    [modal, sessions.length, spawnSession],
  );

  const resumeTracked = useCallback(
    (rec: SessionRecord) => {
      setView("cli");
      spawnSession(
        {
          id: crypto.randomUUID(),
          title: rec.title,
          cli: rec.cli,
          cwd: rec.cwd ?? undefined,
          model: rec.model ?? undefined,
          permissionMode: rec.permissionMode ?? undefined,
          effort: rec.effort ?? undefined,
          profileId: rec.profileId ?? undefined,
          resumeId: rec.id,
          exited: false,
        },
        null,
      );
    },
    [spawnSession],
  );

  const resumeDisk = useCallback(
    (s: ResumableSession) => {
      setView("cli");
      spawnSession(
        {
          id: crypto.randomUUID(),
          title: s.cwd ? basename(s.cwd) : s.id.slice(0, 8),
          cli: "claude",
          cwd: s.cwd ?? undefined,
          resumeId: s.id,
          exited: false,
        },
        null,
      );
    },
    [spawnSession],
  );

  const closeSession = useCallback(
    (id: string) => {
      const remaining = sessions.filter((s) => s.id !== id);
      const nextLayout =
        removeLeaf(layout, id) ??
        (remaining.length ? leaf(remaining[remaining.length - 1].id) : null);
      setSessions(remaining);
      setLayout(nextLayout);
      setActiveId((cur) => (cur === id ? firstLeaf(nextLayout) : cur));
    },
    [sessions, layout],
  );

  // Sidebar click: focus the pane if it's already shown, else show it alone.
  const selectSession = useCallback((id: string) => {
    setLayout((prev) => (hasLeaf(prev, id) ? prev : leaf(id)));
    setActiveId(id);
    setWorkspace(null);
    setTranscript(null);
  }, []);

  const onResize = useCallback((splitId: string, ratio: number) => {
    setLayout((prev) => (prev ? setRatio(prev, splitId, ratio) : prev));
  }, []);

  const markExited = useCallback(
    (id: string) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, exited: true } : s)));
      void refreshHistory();
    },
    [refreshHistory],
  );

  const addProject = useCallback(async () => {
    const selected = await open({ directory: true, title: "Select a project folder" });
    if (typeof selected !== "string") return;
    try {
      setProjects(await api.addProject(selected));
    } catch {
      // ignore add failures (e.g. duplicate path)
    }
  }, []);

  const removeProject = useCallback(async (id: string) => {
    try {
      setProjects(await api.removeProject(id));
    } catch {
      // ignore
    }
  }, []);

  const saveProfile = useCallback(
    async (input: ProfileInput) => {
      const editing = profileModal?.editing ?? null;
      try {
        setProfiles(
          editing ? await api.updateProfile(editing.id, input) : await api.addProfile(input),
        );
      } catch {
        // ignore save failures
      }
      setProfileModal(null);
    },
    [profileModal],
  );

  const removeProfile = useCallback(async (p: Profile) => {
    try {
      setProfiles(await api.removeProfile(p.id));
    } catch {
      // ignore
    }
  }, []);

  const removeHistory = useCallback(async (rec: SessionRecord) => {
    try {
      setHistory(await api.removeSession(rec.id));
    } catch {
      // ignore
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      setHistory(await api.clearSessions());
    } catch {
      // ignore
    }
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );
  const ActiveLogo = activeSession ? AGENT_LOGO[activeSession.cli] : null;

  const openSplit = useCallback(
    (dir: Dir) => {
      if (!activeSession) return;
      setModal({ cwd: activeSession.cwd, splitDir: dir, splitTarget: activeSession.id });
    },
    [activeSession],
  );

  const openEditor = useCallback((project: Project) => {
    setWorkspace({ rootPath: project.path, rootName: project.name });
    setTranscript(null);
  }, []);

  const viewTranscript = useCallback((rec: SessionRecord) => {
    setTranscript(rec);
    setWorkspace(null);
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

  // Global shortcuts. Ctrl/Cmd+Shift avoids clobbering the terminal's own keys,
  // and the capture phase beats xterm's textarea handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey || e.altKey) return;
      let handled = true;
      if (e.code === "KeyT") {
        if (hasCli) setModal({});
      } else if (e.code === "KeyW") {
        if (activeId) closeSession(activeId);
      } else if (e.code === "Comma") {
        setSettingsOpen(true);
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const target = sessions[Number(e.code.slice(5)) - 1];
        if (target) selectSession(target.id);
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hasCli, activeId, sessions, closeSession, selectSession]);

  return (
    <div className="flex h-screen text-[var(--color-text)]">
      <aside className="grid-texture flex w-64 flex-col border-r border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <Logo size={28} />
          <span className="font-mono text-[15px] font-semibold tracking-tight">buddy</span>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="ml-auto rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings (⌃⇧,)"
            className="rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            <IconSettings size={16} />
          </button>
        </div>

        <div className="px-3 pb-3">
          <SegmentedControl<SidebarView>
            value={view}
            onChange={setView}
            compact
            segments={[
              { value: "cli", label: "Sessions", icon: <IconTerminal size={16} /> },
              { value: "projects", label: "Projects", icon: <IconFolder size={16} /> },
              { value: "profiles", label: "Profiles", icon: <IconProfiles size={16} /> },
              { value: "history", label: "History", icon: <IconHistory size={16} /> },
            ]}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {view === "cli" ? (
            <>
              <button
                type="button"
                onClick={() => setModal({})}
                disabled={!hasCli}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <IconPlus size={15} /> New session
              </button>
              <button
                type="button"
                onClick={() => setInstallOpen(true)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] py-2 text-[13px] font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                <IconDownload size={15} /> Install CLIs
              </button>
              <div className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                sessions · {sessions.length}
              </div>
              <SessionList
                sessions={sessions}
                activeId={activeId}
                onSelect={selectSession}
                onClose={closeSession}
              />
            </>
          ) : view === "projects" ? (
            <ProjectsPanel
              projects={projects}
              onAddProject={() => void addProject()}
              onEditProject={openEditor}
              onLaunchProject={(p) => setModal({ cwd: p.path, title: p.name })}
              onRemoveProject={(p) => void removeProject(p.id)}
            />
          ) : view === "profiles" ? (
            <ProfilesPanel
              profiles={profiles}
              onAddProfile={() => setProfileModal({ editing: null })}
              onEditProfile={(p) => setProfileModal({ editing: p })}
              onRemoveProfile={(p) => void removeProfile(p)}
              onLaunchProfile={(p) => setModal({ profileId: p.id })}
            />
          ) : (
            <HistoryPanel
              sessions={history}
              profiles={profiles}
              onResumeTracked={resumeTracked}
              onResumeDisk={resumeDisk}
              onViewTranscript={viewTranscript}
              onRemove={(rec) => void removeHistory(rec)}
              onClear={() => void clearHistory()}
            />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--color-border-soft)] px-4 py-2.5 text-[11px]">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: hasCli ? "var(--color-running)" : "var(--color-text-faint)",
            }}
          />
          {hasCli ? (
            <span className="truncate font-mono text-[var(--color-text-muted)]">
              {availableClis.map((c) => `${c.kind} ${c.version}`).join("  ·  ")}
            </span>
          ) : (
            <button
              onClick={() => void refreshClis()}
              className="font-mono text-[var(--color-text-muted)] underline-offset-2 hover:underline"
            >
              {clisError ? "no CLI found — retry" : "detecting…"}
            </button>
          )}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--color-border-soft)] px-4">
          {workspace ? (
            <>
              <span className="text-[var(--color-accent)]">
                <IconCode size={15} />
              </span>
              <span className="text-[13px] font-medium">{workspace.rootName}</span>
              <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                editor
              </span>
              <span className="ml-auto truncate pl-4 font-mono text-[11px] text-[var(--color-text-faint)]">
                {workspace.rootPath}
              </span>
              <button
                type="button"
                onClick={() => setWorkspace(null)}
                title="Close workspace"
                className="ml-3 rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                <IconClose size={16} />
              </button>
            </>
          ) : activeSession ? (
            <>
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: activeSession.exited
                    ? "var(--color-text-faint)"
                    : AGENT_COLOR[activeSession.cli],
                }}
              />
              <span className="text-[13px] font-medium">{activeSession.title}</span>
              {ActiveLogo && (
                <span
                  className="flex items-center gap-1 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ color: AGENT_COLOR[activeSession.cli] }}
                >
                  <ActiveLogo size={11} />
                  {AGENT_LABEL[activeSession.cli]}
                </span>
              )}
              {activeSession.model && (
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {activeSession.model}
                </span>
              )}
              {activeSession.effort && (
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {activeSession.effort}
                </span>
              )}
              {activeSession.exited && (
                <span className="text-[11px] text-[var(--color-text-faint)]">exited</span>
              )}
              <span className="ml-auto truncate pl-4 font-mono text-[11px] text-[var(--color-text-faint)]">
                {activeSession.cwd ?? "~"}
              </span>
              <div className="flex items-center gap-0.5 pl-3">
                <button
                  type="button"
                  onClick={() => openSplit("row")}
                  title="Split right (new session)"
                  className="rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                >
                  <IconSplitRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => openSplit("col")}
                  title="Split down (new session)"
                  className="rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                >
                  <IconSplitDown size={16} />
                </button>
              </div>
            </>
          ) : (
            <span className="text-[13px] text-[var(--color-text-faint)]">No session</span>
          )}
        </header>

        <div className="relative flex-1">
          {sessions.length === 0 && !workspace && !transcript && (
            <div className="atmosphere grid-texture flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Logo size={52} />
              <div className="text-[15px] font-medium">
                {hasCli ? "No active session" : "No CLI found"}
              </div>
              <p className="max-w-xs text-[13px] leading-relaxed text-[var(--color-text-muted)]">
                {hasCli
                  ? "Start one from the CLI tab, or open a project folder under Projects."
                  : (clisError ??
                    "Install a supported CLI — Claude, Codex, Gemini, opencode, or Grok.")}
              </p>
              {!hasCli && (
                <button
                  type="button"
                  onClick={() => setInstallOpen(true)}
                  className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110"
                >
                  <IconDownload size={15} /> Install a CLI
                </button>
              )}
            </div>
          )}

          <div
            ref={boxRef}
            className="absolute inset-2"
            style={workspace || transcript ? { display: "none" } : undefined}
          >
            {sessions.map((session) => {
              const rect = rectBySession.get(session.id);
              const focused = isSplit && session.id === activeId;
              return (
                <div
                  key={session.id}
                  onPointerDown={() => setActiveId(session.id)}
                  className="absolute overflow-hidden rounded-lg bg-[#0a0a0b]"
                  style={
                    rect
                      ? {
                          left: rect.x,
                          top: rect.y,
                          width: rect.w,
                          height: rect.h,
                          boxShadow: focused
                            ? "inset 0 0 0 1px var(--color-accent-dim)"
                            : undefined,
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
                      onExit={() => markExited(session.id)}
                    />
                  </div>
                </div>
              );
            })}
            {isSplit && <SplitDividers dividers={dividers} onResize={onResize} />}
          </div>

          {workspace && (
            <div className="absolute inset-0">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-text-faint)]">
                    Loading workspace…
                  </div>
                }
              >
                <Workspace
                  key={workspace.rootPath}
                  rootPath={workspace.rootPath}
                  rootName={workspace.rootName}
                  theme={theme}
                />
              </Suspense>
            </div>
          )}

        </div>

        {transcript && (
          <div className="absolute inset-0 z-20">
            <TranscriptViewer
              key={transcript.id}
              session={transcript}
              onClose={() => setTranscript(null)}
            />
          </div>
        )}
      </main>

      <NewSessionModal
        open={modal !== null}
        clis={clis}
        profiles={profiles}
        defaultCwd={modal?.cwd}
        defaultProfileId={modal?.profileId}
        defaultPermission={settings.defaultPermission}
        defaultEffort={settings.defaultEffort}
        onLaunch={handleLaunch}
        onClose={() => setModal(null)}
      />

      <ProfileModal
        open={profileModal !== null}
        profile={profileModal?.editing ?? null}
        onSave={(input) => void saveProfile(input)}
        onClose={() => setProfileModal(null)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        theme={theme}
        onChangeSettings={updateSettings}
        onChangeTheme={setThemeChecked}
        onClose={() => setSettingsOpen(false)}
      />

      <InstallModal
        open={installOpen}
        clis={clis}
        onInstalled={() => void refreshClis()}
        onClose={() => {
          setInstallOpen(false);
          void refreshClis();
        }}
      />
    </div>
  );
}
