// Central app state (zustand). All cross-cutting state that used to live in
// App.tsx: CLI detection, sessions + split layout, projects, profiles,
// history, UI surfaces (modals, workspace, transcript), theme/settings, toasts.
// Components subscribe with selectors; actions encapsulate the api calls.

import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  api,
  type CliInfo,
  type Profile,
  type ProfileInput,
  type ResumableSession,
  type SessionRecord,
} from "../lib/bindings";
import {
  firstLeaf,
  hasLeaf,
  leaf,
  removeLeaf,
  setRatio as setTreeRatio,
  splitLeaf,
  type Dir,
  type PaneNode,
} from "../lib/layout";
import { applyTheme, getInitialTheme, type Theme } from "../lib/theme";
import { getInitialSettings, saveSettings, type Settings } from "../lib/settings";
import type { Project, SessionTab, SidebarView } from "../types";

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
  markExited: (id: string) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  toggleZoom: () => void;

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
  };
}

export const useApp = create<AppState>((set, get) => ({
  // --- CLI detection ---
  clis: [],
  clisError: null,
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
        },
        null,
      ),
    });
  },

  requestClose: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    if (session.exited) get().closeSession(id);
    else set({ confirmCloseId: id });
  },

  closeSession: (id) => {
    const { sessions, layout, activeId, zoomedId } = get();
    const remaining = sessions.filter((s) => s.id !== id);
    const nextLayout =
      removeLeaf(layout, id) ??
      (remaining.length ? leaf(remaining[remaining.length - 1].id) : null);
    set({
      sessions: remaining,
      layout: nextLayout,
      activeId: activeId === id ? firstLeaf(nextLayout) : activeId,
      zoomedId: zoomedId === id ? null : zoomedId,
      confirmCloseId: null,
    });
  },

  cancelClose: () => set({ confirmCloseId: null }),

  // Sidebar click: focus the pane if it's already shown, else show it alone.
  selectSession: (id) => {
    const { layout } = get();
    set({
      layout: hasLeaf(layout, id) ? layout : leaf(id),
      activeId: id,
      zoomedId: null,
      workspace: null,
      transcript: null,
    });
  },

  renameSession: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    set({
      sessions: get().sessions.map((s) => (s.id === id ? { ...s, title: trimmed } : s)),
    });
    // Keep the history record in sync; harmless if the row is gone.
    api.renameSession(id, trimmed).then(
      (history) => set({ history }),
      () => {},
    );
  },

  markExited: (id) => {
    set({ sessions: get().sessions.map((s) => (s.id === id ? { ...s, exited: true } : s)) });
    void get().refreshHistory();
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
    set({ workspace: { rootPath: project.path, rootName: project.name }, transcript: null }),
  closeWorkspace: () => set({ workspace: null }),
  transcript: null,
  viewTranscript: (transcript) => set({ transcript, workspace: null }),
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
