// Central app state (zustand). All cross-cutting state that used to live in
// App.tsx: CLI detection, sessions + split layout, projects, profiles,
// history, UI surfaces (modals, workspace, transcript), theme/settings, toasts.
// Components subscribe with selectors; actions encapsulate the api calls.

import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import {
  api,
  type CliInfo,
  type CliKind,
  type CliUpdateInfo,
  type Profile,
  type ProfileInput,
  type ResumableSession,
  type SessionRecord,
} from "../lib/bindings";
import {
  firstLeaf,
  hasLeaf,
  leaf,
  leafIds,
  mapLeaves,
  removeLeaf,
  replaceLeaf,
  setRatio as setTreeRatio,
  splitLeaf,
  type Dir,
  type PaneNode,
} from "../lib/layout";
import {
  loadFormations,
  saveFormations,
  type Formation,
  type FormationSlot,
} from "../lib/formations";
import { loadSnippets, saveSnippets, type Snippet } from "../lib/snippets";
import { applyTheme, getInitialTheme, type Theme } from "../lib/theme";
import { getInitialSettings, saveSettings, type Settings } from "../lib/settings";
import {
  clearSnapshot,
  loadSnapshot,
  saveSnapshot,
  type WorkspaceSnapshot,
} from "../lib/snapshot";
import type { ActivityState, Project, SessionTab, SidebarView } from "../types";

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export interface ModalContext {
  cwd?: string;
  title?: string;
  profileId?: string;
  /** When set, the launched session splits this pane instead of replacing the view. */
  splitDir?: Dir;
  splitTarget?: string;
}

export interface NewSessionConfig {
  cli: SessionTab["cli"];
  cwd?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  profileId?: string;
}

export interface ToastItem {
  id: string;
  message: string;
  kind: "info" | "error";
}

interface AppState {
  // --- CLI detection ---
  clis: CliInfo[];
  clisError: string | null;
  refreshClis: () => Promise<void>;

  // --- CLI updates (npm registry vs installed versions) ---
  cliUpdates: CliUpdateInfo[];
  checkingUpdates: boolean;
  /** CLI kinds with an update currently being applied. */
  updatingCli: Record<string, boolean>;
  /** notify=true (launch check) toasts when updates exist and stays quiet on
   *  errors; notify=false (manual check from Settings) toasts errors instead. */
  checkCliUpdates: (notify: boolean) => Promise<void>;
  updateCli: (kind: CliKind) => Promise<void>;
  updateAllClis: () => Promise<void>;

  // --- sessions & split layout ---
  sessions: SessionTab[];
  layout: PaneNode | null;
  activeId: string | null;
  /** When set (and the layout is split), only this pane is shown full-size. */
  zoomedId: string | null;
  /** Session awaiting a "really close?" confirmation (still running). */
  confirmCloseId: string | null;
  launch: (config: NewSessionConfig) => void;
  resumeTracked: (rec: SessionRecord) => void;
  resumeDisk: (s: ResumableSession) => void;
  requestClose: (id: string) => void;
  closeSession: (id: string) => void;
  cancelClose: () => void;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  markExited: (id: string, code: number | null) => void;
  /** Record the backend PTY id once the session is live (enables resume). */
  setPtyId: (id: string, ptyId: string) => void;
  /** Replace a dead pane with a fresh session in the same spot. Claude picks
   *  the conversation back up (resume); other CLIs start clean. */
  relaunch: (id: string) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  toggleZoom: () => void;

  // --- live activity (busy = streaming output; attention = bell while unfocused) ---
  activity: Record<string, ActivityState>;
  reportOutput: (id: string) => void;
  reportBell: (id: string) => void;

  // --- broadcast (keystrokes fan out to every visible pane) ---
  broadcast: boolean;
  toggleBroadcast: () => void;
  broadcastWrite: (data: string) => void;

  // --- previous workspace (offered for restore after a crash/restart) ---
  restorable: WorkspaceSnapshot | null;
  restoreWorkspace: () => void;
  dismissRestore: () => void;

  // --- formations (saved multi-agent layouts) ---
  formations: Formation[];
  saveFormation: (name: string) => void;
  launchFormation: (id: string) => void;
  removeFormation: (id: string) => void;

  // --- prompt composer, snippets & per-session queue ---
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  snippets: Snippet[];
  addSnippet: (text: string) => void;
  removeSnippet: (id: string) => void;
  /** Prompts waiting for a busy agent to go quiet, per session. */
  queued: Record<string, string[]>;
  /** Send a prompt to the active pane or every visible pane; busy agents
   *  queue it and receive it when their output settles. */
  sendPrompt: (text: string, target: "active" | "all") => void;
  /** Adopt the first real prompt as the session title (auto-titled tabs only). */
  autoTitle: (id: string, text: string) => void;

  // --- projects ---
  projects: Project[];
  refreshProjects: () => Promise<void>;
  addProject: () => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  // --- profiles ---
  profiles: Profile[];
  refreshProfiles: () => Promise<void>;
  saveProfile: (editing: Profile | null, input: ProfileInput) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;

  // --- session history ---
  history: SessionRecord[];
  refreshHistory: () => Promise<void>;
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;

  // --- UI surfaces ---
  view: SidebarView;
  setView: (view: SidebarView) => void;
  modal: ModalContext | null;
  openModal: (ctx: ModalContext) => void;
  closeModal: () => void;
  installOpen: boolean;
  setInstallOpen: (open: boolean) => void;
  profileModal: { editing: Profile | null } | null;
  setProfileModal: (m: { editing: Profile | null } | null) => void;
  workspace: { rootPath: string; rootName: string } | null;
  openWorkspace: (project: Project) => void;
  closeWorkspace: () => void;
  transcript: SessionRecord | null;
  viewTranscript: (rec: SessionRecord | null) => void;
  /** Git changes overlay, pointed at a repository root. */
  diffView: { rootPath: string; rootName: string } | null;
  openDiff: (target: { rootPath: string; rootName: string }) => void;
  closeDiff: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  // --- theme & settings ---
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  settings: Settings;
  updateSettings: (settings: Settings) => void;

  // --- toasts ---
  toasts: ToastItem[];
  pushToast: (message: string, kind?: ToastItem["kind"]) => void;
  dismissToast: (id: string) => void;
}

/** Add a session tab (optionally splitting a pane), focus it, close overlays. */
function spawn(
  state: AppState,
  tab: SessionTab,
  split: { dir: Dir; target: string } | null,
): Partial<AppState> {
  const layout =
    split && state.layout && hasLeaf(state.layout, split.target)
      ? splitLeaf(state.layout, split.target, split.dir, tab.id, crypto.randomUUID())
      : leaf(tab.id);
  return {
    sessions: [...state.sessions, tab],
    layout,
    activeId: tab.id,
    zoomedId: null,
    modal: null,
    workspace: null,
    transcript: null,
    diffView: null,
    broadcast: state.broadcast && layout.kind === "split",
  };
}

/** Output silence after which a "busy" session settles back to quiet. */
const IDLE_AFTER_MS = 2500;
/** Per-session timers driving the busy→quiet transition (not reactive state). */
const idleTimers = new Map<string, number>();
/** When each session last turned busy — long runs flash the taskbar on finish. */
const busySince = new Map<string, number>();
/** A run this long counts as "work worth announcing" when it finishes. */
const LONG_RUN_MS = 15_000;

/** Paste a prompt into a PTY (bracketed, so TUIs take newlines verbatim) and submit. */
function writePrompt(ptyId: string, text: string): void {
  api.writeTerminal(ptyId, `\x1b[200~${text}\x1b[201~\r`).catch(() => {});
}

/** Flash the Windows taskbar when buddy isn't the focused window. */
function flashTaskbar(critical: boolean): void {
  if (document.hasFocus() || !useApp.getState().settings.notifications) return;
  getCurrentWindow()
    .requestUserAttention(critical ? UserAttentionType.Critical : UserAttentionType.Informational)
    .catch(() => {});
}

function dropActivity(
  activity: Record<string, ActivityState>,
  id: string,
): Record<string, ActivityState> {
  const timer = idleTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    idleTimers.delete(id);
  }
  if (!(id in activity)) return activity;
  const next = { ...activity };
  delete next[id];
  return next;
}

export const useApp = create<AppState>((set, get) => ({
  // --- CLI detection ---
  clis: [],
  clisError: null,
  cliUpdates: [],
  checkingUpdates: false,
  updatingCli: {},

  checkCliUpdates: async (notify) => {
    if (get().checkingUpdates) return;
    set({ checkingUpdates: true });
    try {
      const cliUpdates = await api.checkCliUpdates();
      set({ cliUpdates });
      const fresh = cliUpdates.filter((u) => u.hasUpdate);
      if (notify && fresh.length > 0) {
        const label = (kind: CliKind) =>
          get().clis.find((c) => c.kind === kind)?.label ?? kind;
        get().pushToast(
          fresh.length === 1
            ? `${label(fresh[0].kind)} ${fresh[0].latest} is available — update in Settings`
            : `${fresh.length} CLI updates available — open Settings → About`,
        );
      }
    } catch (e) {
      if (!notify) get().pushToast(errorMessage(e), "error");
    } finally {
      set({ checkingUpdates: false });
    }
  },

  updateCli: async (kind) => {
    if (get().updatingCli[kind]) return;
    set({ updatingCli: { ...get().updatingCli, [kind]: true } });
    try {
      const info = await api.updateCli(kind);
      set({
        clis: get().clis.map((c) => (c.kind === kind ? info : c)),
        // The vendor command installs the latest — settle the row locally; a
        // manual re-check would surface the rare silent no-op.
        cliUpdates: get().cliUpdates.map((u) =>
          u.kind === kind ? { ...u, installed: info.version ?? u.latest, hasUpdate: false } : u,
        ),
      });
      get().pushToast(`${info.label} updated to ${info.version ?? "the latest version"}`);
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    } finally {
      const { [kind]: _, ...rest } = get().updatingCli;
      set({ updatingCli: rest });
    }
  },

  updateAllClis: async () => {
    // Sequential on purpose — npm/global installs fight over the same dirs.
    for (const u of get().cliUpdates.filter((x) => x.hasUpdate)) {
      await get().updateCli(u.kind);
    }
  },

  refreshClis: async () => {
    try {
      set({ clis: await api.listClis(), clisError: null });
    } catch (e) {
      set({ clisError: errorMessage(e) });
    }
  },

  // --- sessions & split layout ---
  sessions: [],
  layout: null,
  activeId: null,
  zoomedId: null,
  confirmCloseId: null,

  launch: (config) => {
    const state = get();
    const modal = state.modal;
    const split =
      modal?.splitDir && modal.splitTarget
        ? { dir: modal.splitDir, target: modal.splitTarget }
        : null;
    const title =
      modal?.title ??
      (config.cwd ? basename(config.cwd) : `Session ${state.sessions.length + 1}`);
    set(
      spawn(
        state,
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
          titleAuto: !modal?.title,
          startedAt: Date.now(),
        },
        split,
      ),
    );
  },

  resumeTracked: (rec) => {
    const state = get();
    set({
      view: "cli",
      ...spawn(
        state,
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
          startedAt: Date.now(),
        },
        null,
      ),
    });
  },

  resumeDisk: (s) => {
    const state = get();
    set({
      view: "cli",
      ...spawn(
        state,
        {
          id: crypto.randomUUID(),
          title: s.cwd ? basename(s.cwd) : s.id.slice(0, 8),
          cli: "claude",
          cwd: s.cwd ?? undefined,
          resumeId: s.id,
          exited: false,
          startedAt: Date.now(),
        },
        null,
      ),
    });
  },

  requestClose: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    if (session.exited || !get().settings.confirmClose) get().closeSession(id);
    else set({ confirmCloseId: id });
  },

  closeSession: (id) => {
    const { sessions, layout, activeId, zoomedId, activity, broadcast, queued } = get();
    const remaining = sessions.filter((s) => s.id !== id);
    const nextLayout =
      removeLeaf(layout, id) ??
      (remaining.length ? leaf(remaining[remaining.length - 1].id) : null);
    busySince.delete(id);
    const nextQueued = { ...queued };
    delete nextQueued[id];
    set({
      sessions: remaining,
      layout: nextLayout,
      activeId: activeId === id ? firstLeaf(nextLayout) : activeId,
      zoomedId: zoomedId === id ? null : zoomedId,
      confirmCloseId: null,
      activity: dropActivity(activity, id),
      broadcast: broadcast && nextLayout?.kind === "split",
      queued: nextQueued,
    });
  },

  cancelClose: () => set({ confirmCloseId: null }),

  // Sidebar click: focus the pane if it's already shown, else show it alone.
  // Visiting a session also acknowledges its attention flag.
  selectSession: (id) => {
    const { layout, activity, broadcast } = get();
    const nextLayout = layout && hasLeaf(layout, id) ? layout : leaf(id);
    const nextActivity =
      activity[id] === "attention" ? dropActivity(activity, id) : activity;
    set({
      layout: nextLayout,
      activeId: id,
      zoomedId: null,
      workspace: null,
      transcript: null,
      diffView: null,
      activity: nextActivity,
      broadcast: broadcast && nextLayout.kind === "split",
    });
  },

  renameSession: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const session = get().sessions.find((s) => s.id === id);
    set({
      sessions: get().sessions.map((s) =>
        s.id === id ? { ...s, title: trimmed, titleAuto: false } : s,
      ),
    });
    // Keep the history record in sync. History rows are keyed by the backend
    // PTY id, not the tab id; harmless if the row is gone.
    api.renameSession(session?.ptyId ?? id, trimmed).then(
      (history) => set({ history }),
      () => {},
    );
  },

  markExited: (id, code) => {
    const { sessions, activity, queued } = get();
    busySince.delete(id);
    const nextQueued = { ...queued };
    delete nextQueued[id];
    set({
      sessions: sessions.map((s) =>
        s.id === id ? { ...s, exited: true, exitCode: code } : s,
      ),
      activity: dropActivity(activity, id),
      queued: nextQueued,
    });
    void get().refreshHistory();
  },

  setPtyId: (id, ptyId) => {
    set({ sessions: get().sessions.map((s) => (s.id === id ? { ...s, ptyId } : s)) });
  },

  relaunch: (id) => {
    const state = get();
    const old = state.sessions.find((s) => s.id === id);
    if (!old || !old.exited) return;
    const fresh: SessionTab = {
      ...old,
      id: crypto.randomUUID(),
      ptyId: undefined,
      exited: false,
      exitCode: undefined,
      resumeId: old.cli === "claude" ? old.ptyId ?? old.resumeId : undefined,
      startedAt: Date.now(),
    };
    set({
      sessions: state.sessions.map((s) => (s.id === id ? fresh : s)),
      layout: state.layout ? replaceLeaf(state.layout, id, fresh.id) : leaf(fresh.id),
      activeId: state.activeId === id ? fresh.id : state.activeId,
      zoomedId: state.zoomedId === id ? fresh.id : state.zoomedId,
    });
  },

  resizeSplit: (splitId, ratio) => {
    const { layout } = get();
    if (layout) set({ layout: setTreeRatio(layout, splitId, ratio) });
  },

  toggleZoom: () => {
    const { zoomedId, activeId, layout } = get();
    if (zoomedId) set({ zoomedId: null });
    else if (activeId && layout && layout.kind === "split") set({ zoomedId: activeId });
  },

  // --- live activity ---
  activity: {},

  // Called on every output chunk. Cheap when already busy: only the idle timer
  // resets, no state write (so streaming output doesn't thrash renders).
  reportOutput: (id) => {
    const prev = idleTimers.get(id);
    if (prev) clearTimeout(prev);
    idleTimers.set(
      id,
      window.setTimeout(() => {
        idleTimers.delete(id);
        const { activity, queued, sessions } = get();
        if (activity[id] !== "busy") return; // attention stays until visited
        const next = { ...activity };
        delete next[id];
        set({ activity: next });
        // A long run just finished — worth a taskbar nudge if buddy is buried.
        const since = busySince.get(id);
        busySince.delete(id);
        if (since && Date.now() - since >= LONG_RUN_MS) flashTaskbar(false);
        // The agent went quiet: feed it the next queued prompt, one per lull.
        const q = queued[id];
        if (q?.length) {
          const tab = sessions.find((s) => s.id === id);
          if (tab?.ptyId && !tab.exited) {
            writePrompt(tab.ptyId, q[0]);
            const nextQueued = { ...queued };
            if (q.length > 1) nextQueued[id] = q.slice(1);
            else delete nextQueued[id];
            set({ queued: nextQueued });
          }
        }
      }, IDLE_AFTER_MS),
    );
    const { activity } = get();
    if (!activity[id]) {
      busySince.set(id, Date.now());
      set({ activity: { ...activity, [id]: "busy" } });
    }
  },

  // BEL in an unfocused pane usually means "the agent wants you" (permission
  // prompts ring it). The focused pane is already being watched — ignore it.
  reportBell: (id) => {
    const { activity, activeId } = get();
    if (id === activeId || activity[id] === "attention") return;
    set({ activity: { ...activity, [id]: "attention" } });
    flashTaskbar(true);
  },

  // --- broadcast ---
  broadcast: false,
  toggleBroadcast: () => {
    const { broadcast, layout, pushToast } = get();
    if (!broadcast && layout?.kind !== "split") return;
    set({ broadcast: !broadcast });
    pushToast(
      broadcast ? "Broadcast off" : "Broadcast on — keystrokes go to every pane",
    );
  },
  broadcastWrite: (data) => {
    const { sessions, layout } = get();
    for (const s of sessions) {
      if (!s.exited && s.ptyId && hasLeaf(layout, s.id)) {
        api.writeTerminal(s.ptyId, data).catch(() => {});
      }
    }
  },

  // --- previous workspace ---
  restorable: loadSnapshot(),

  restoreWorkspace: () => {
    const snap = get().restorable;
    if (!snap) return;
    // Fresh tab ids (the old PTYs are gone); Claude tabs resume their backend
    // session, everything else relaunches with the same configuration.
    const ids = new Map<string, string>();
    const sessions = snap.sessions.map((old): SessionTab => {
      const id = crypto.randomUUID();
      ids.set(old.id, id);
      return {
        ...old,
        id,
        ptyId: undefined,
        exited: false,
        exitCode: undefined,
        resumeId: old.cli === "claude" ? old.ptyId ?? old.resumeId : undefined,
        startedAt: Date.now(),
      };
    });
    const layout =
      mapLeaves(snap.layout, (oldId) => ids.get(oldId) ?? null) ??
      (sessions.length ? leaf(sessions[0].id) : null);
    set({
      restorable: null,
      sessions,
      layout,
      activeId: firstLeaf(layout),
      zoomedId: null,
      view: "cli",
    });
  },

  dismissRestore: () => {
    clearSnapshot();
    set({ restorable: null });
  },

  // --- formations ---
  formations: loadFormations(),

  saveFormation: (name) => {
    const { sessions, layout, formations } = get();
    if (!layout) return;
    const bySession = new Map(sessions.map((s) => [s.id, s]));
    const slots: FormationSlot[] = [];
    const slotIndex = new Map<string, string>();
    for (const id of leafIds(layout)) {
      const s = bySession.get(id);
      if (!s) continue;
      slotIndex.set(id, String(slots.length));
      slots.push({
        cli: s.cli,
        cwd: s.cwd,
        model: s.model,
        permissionMode: s.permissionMode,
        effort: s.effort,
        profileId: s.profileId,
        title: s.title,
      });
    }
    const tree = mapLeaves(layout, (id) => slotIndex.get(id) ?? null);
    if (!slots.length || !tree) return;
    const formation: Formation = {
      id: crypto.randomUUID(),
      name: name.trim() || `Formation ${formations.length + 1}`,
      layout: tree,
      slots,
    };
    const next = [...formations, formation];
    saveFormations(next);
    set({ formations: next });
    get().pushToast(`Saved formation “${formation.name}”`);
  },

  // Launching adds the squad's tabs and shows its split tree. Sessions already
  // running stay alive — just hidden until selected from the sidebar.
  launchFormation: (id) => {
    const state = get();
    const formation = state.formations.find((f) => f.id === id);
    if (!formation) return;
    const tabs = formation.slots.map(
      (slot): SessionTab => ({
        ...slot,
        id: crypto.randomUUID(),
        title: slot.title ?? (slot.cwd ? basename(slot.cwd) : slot.cli),
        exited: false,
        titleAuto: !slot.title,
        startedAt: Date.now(),
      }),
    );
    const layout =
      mapLeaves(formation.layout, (idx) => tabs[Number(idx)]?.id ?? null) ??
      leaf(tabs[0].id);
    set({
      sessions: [...state.sessions, ...tabs],
      layout,
      activeId: firstLeaf(layout),
      zoomedId: null,
      view: "cli",
      workspace: null,
      transcript: null,
      diffView: null,
      broadcast: false,
    });
  },

  removeFormation: (id) => {
    const next = get().formations.filter((f) => f.id !== id);
    saveFormations(next);
    set({ formations: next });
  },

  // --- prompt composer, snippets & queue ---
  composerOpen: false,
  setComposerOpen: (composerOpen) => set({ composerOpen }),

  snippets: loadSnippets(),
  addSnippet: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = [...get().snippets, { id: crypto.randomUUID(), text: trimmed }];
    saveSnippets(next);
    set({ snippets: next });
  },
  removeSnippet: (id) => {
    const next = get().snippets.filter((s) => s.id !== id);
    saveSnippets(next);
    set({ snippets: next });
  },

  queued: {},

  sendPrompt: (text, target) => {
    const { sessions, layout, activeId, activity, queued } = get();
    const trimmed = text.trim();
    if (!trimmed) return;
    const targets = sessions.filter(
      (s) =>
        !s.exited &&
        s.ptyId &&
        (target === "all" ? hasLeaf(layout, s.id) : s.id === activeId),
    );
    if (!targets.length) {
      get().pushToast("No running pane to send to", "error");
      return;
    }
    let queuedCount = 0;
    const nextQueued = { ...queued };
    for (const s of targets) {
      if (activity[s.id] === "busy") {
        nextQueued[s.id] = [...(nextQueued[s.id] ?? []), trimmed];
        queuedCount++;
      } else {
        writePrompt(s.ptyId!, trimmed);
      }
      if (s.titleAuto) get().autoTitle(s.id, trimmed);
    }
    set({ composerOpen: false, ...(queuedCount ? { queued: nextQueued } : null) });
    if (queuedCount) {
      get().pushToast(
        `Queued for ${queuedCount} busy agent${queuedCount > 1 ? "s" : ""} — sends when quiet`,
      );
    }
  },

  autoTitle: (id, text) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session || !session.titleAuto || session.exited) return;
    const title = text.replace(/\s+/g, " ").trim().slice(0, 48);
    if (title.length < 4) return;
    set({
      sessions: get().sessions.map((s) =>
        s.id === id ? { ...s, title, titleAuto: false } : s,
      ),
    });
    api.renameSession(session.ptyId ?? id, title).then(
      (history) => set({ history }),
      () => {},
    );
  },

  // --- projects ---
  projects: [],
  refreshProjects: async () => {
    try {
      set({ projects: await api.listProjects() });
    } catch {
      // initial load only — leave the list as-is
    }
  },
  addProject: async () => {
    const selected = await open({ directory: true, title: "Select a project folder" });
    if (typeof selected !== "string") return;
    try {
      set({ projects: await api.addProject(selected) });
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    }
  },
  removeProject: async (id) => {
    try {
      set({ projects: await api.removeProject(id) });
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    }
  },

  // --- profiles ---
  profiles: [],
  refreshProfiles: async () => {
    try {
      set({ profiles: await api.listProfiles() });
    } catch {
      // initial load only
    }
  },
  saveProfile: async (editing, input) => {
    try {
      set({
        profiles: editing
          ? await api.updateProfile(editing.id, input)
          : await api.addProfile(input),
        profileModal: null,
      });
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    }
  },
  removeProfile: async (id) => {
    try {
      set({ profiles: await api.removeProfile(id) });
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    }
  },

  // --- session history ---
  history: [],
  refreshHistory: async () => {
    try {
      set({ history: await api.listSessions() });
    } catch {
      // background refresh only
    }
  },
  removeHistory: async (id) => {
    try {
      set({ history: await api.removeSession(id) });
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    }
  },
  clearHistory: async () => {
    try {
      set({ history: await api.clearSessions() });
    } catch (e) {
      get().pushToast(errorMessage(e), "error");
    }
  },

  // --- UI surfaces ---
  view: "cli",
  setView: (view) => {
    set({ view });
    if (view === "history") void get().refreshHistory();
  },
  modal: null,
  openModal: (ctx) => set({ modal: ctx }),
  closeModal: () => set({ modal: null }),
  installOpen: false,
  setInstallOpen: (installOpen) => set({ installOpen }),
  profileModal: null,
  setProfileModal: (profileModal) => set({ profileModal }),
  workspace: null,
  openWorkspace: (project) =>
    set({
      workspace: { rootPath: project.path, rootName: project.name },
      transcript: null,
      diffView: null,
    }),
  closeWorkspace: () => set({ workspace: null }),
  transcript: null,
  viewTranscript: (transcript) => set({ transcript, workspace: null, diffView: null }),
  diffView: null,
  openDiff: (diffView) => set({ diffView, transcript: null }),
  closeDiff: () => set({ diffView: null }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  // --- theme & settings ---
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  settings: getInitialSettings(),
  updateSettings: (settings) => {
    saveSettings(settings);
    set({ settings });
  },

  // --- toasts ---
  toasts: [],
  pushToast: (message, kind = "info") => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, kind }] });
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

// Persist the open workspace on every change so a crash or restart can offer
// to bring it back (closing the last session clears the snapshot).
useApp.subscribe((s, prev) => {
  if (s.sessions !== prev.sessions || s.layout !== prev.layout) {
    saveSnapshot({ sessions: s.sessions, layout: s.layout });
  }
});
