// State for the built-in chat (zustand, separate from the main app store).
// Turns run through the locally installed agent CLIs in headless mode, riding
// the user's existing logins. Owns the thread list, the active thread, the
// model/effort selection, and the one in-flight stream. Token deltas are
// buffered and flushed on a short timer so streaming doesn't thrash renders.

import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  api,
  Channel,
  type ChatMessage,
  type ChatMeta,
  type ChatProject,
  type ChatProvider,
  type ChatStreamMsg,
} from "../lib/bindings";
import {
  effectiveEffort,
  PROVIDER_LABEL,
  resolveAccess,
  wireEffort,
  type Access,
  type Effort,
} from "../lib/chatModels";
import { loadChatPrefs, saveChatPrefs } from "../lib/chatPrefs";
import { errorMessage, useApp } from "./index";

export interface ChatThreadState {
  id: string;
  title: string;
  /** Title was derived from the first prompt. */
  titleAuto: boolean;
  /** CLI sessions backing this thread — resumed turn over turn. */
  claudeSessionId: string | null;
  codexSessionId: string | null;
  /** Owning chat project; null = ungrouped. */
  projectId: string | null;
  messages: ChatMessage[];
}

interface ChatState {
  loaded: boolean;
  metas: ChatMeta[];
  projects: ChatProject[];
  thread: ChatThreadState | null;
  /** Project context for the next fresh thread (and the hero banner). */
  activeProjectId: string | null;
  provider: ChatProvider;
  model: string;
  effort: Effort;
  /** Tool access for upcoming turns ("auto" follows the project context). */
  access: Access;
  /** True while a reply is streaming into the active thread. */
  streaming: boolean;

  init: () => Promise<void>;
  setModel: (provider: ChatProvider, model: string) => void;
  setEffort: (effort: Effort) => void;
  setAccess: (access: Access) => void;
  newThread: (projectId?: string | null) => void;
  openThread: (id: string) => Promise<void>;
  removeThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  moveThread: (id: string, projectId: string | null) => Promise<void>;
  /** Pick a folder on disk and add it as a project (name = folder name). */
  addProject: () => Promise<void>;
  updateProject: (id: string, patch: { name?: string; instructions?: string }) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
}

function toast(message: string, kind?: "info" | "error"): void {
  useApp.getState().pushToast(message, kind);
}

/** Which detected CLI backs a chat provider. */
const CLI_FOR: Record<ChatProvider, string> = { anthropic: "claude", openai: "codex" };

/** A pointer at the fix when the CLI reports it isn't signed in. */
function authHint(provider: ChatProvider, message: string): string {
  return /log ?in|sign ?in|sign(ed)? ?out|auth|credential/i.test(message)
    ? provider === "openai"
      ? " — run `codex login` in a terminal, then try again"
      : " — run `claude` in a terminal and `/login`, then try again"
    : "";
}

/**
 * Threads from before a CLI session exists (or whose session was lost) carry
 * their recent turns inside the prompt, newest-first within a size budget.
 */
function historyPreamble(messages: ChatMessage[]): string {
  const turns = messages.filter((m) => m.content);
  if (!turns.length) return "";
  const parts: string[] = [];
  let budget = 16_000;
  for (let i = turns.length - 1; i >= 0; i--) {
    const m = turns[i];
    const line = `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    if (line.length > budget) break;
    budget -= line.length;
    parts.unshift(line);
  }
  if (!parts.length) return ""; // newest turn alone blows the budget
  return `Context — earlier turns of this conversation:\n\n${parts.join("\n\n")}\n\n---\n\n`;
}

/** Project instructions block injected when a CLI session starts fresh —
 *  resumed sessions already carry it in their server-side history. */
function instructionsPreamble(project: ChatProject | undefined): string {
  const text = project?.instructions.trim();
  if (!text) return "";
  return `Project instructions — they apply to this whole conversation:\n\n${text}\n\n---\n\n`;
}

// --- streaming internals (not reactive state) --------------------------------

/** The active backend stream; null when idle. Module-level on purpose. */
let live: {
  streamId: string | null; // null until chat_stream resolves
  threadId: string;
  messageId: string;
  closed: boolean;
} | null = null;

/** Pending deltas waiting for the next flush. */
let pending = { text: "", thinking: "" };
let flushTimer: number | null = null;

function persist(get: () => ChatState): void {
  const { thread, provider, model } = get();
  if (!thread || !thread.messages.length) return;
  // Tag the meta with the provider/model that actually answered last — the
  // picker may have moved on since (it only affects the NEXT message).
  const lastTurn = [...thread.messages].reverse().find((m) => m.role === "assistant" && m.provider);
  api
    .saveChat({
      id: thread.id,
      title: thread.title,
      provider: lastTurn?.provider ?? provider,
      model: lastTurn?.model ?? model,
      claudeSessionId: thread.claudeSessionId,
      codexSessionId: thread.codexSessionId,
      projectId: thread.projectId,
      messages: thread.messages,
    })
    .then(
      (metas) => useChat.setState({ metas }),
      () => {},
    );
}

export const useChat = create<ChatState>((set, get) => {
  const prefs = loadChatPrefs();

  /** Apply a patch to one message of the active thread. */
  const patchMessage = (threadId: string, messageId: string, patch: (m: ChatMessage) => ChatMessage) => {
    const { thread } = get();
    if (!thread || thread.id !== threadId) return;
    set({
      thread: {
        ...thread,
        messages: thread.messages.map((m) => (m.id === messageId ? patch(m) : m)),
      },
    });
  };

  /** Apply a patch to the active thread itself (session ids). */
  const patchThread = (threadId: string, patch: Partial<ChatThreadState>) => {
    const { thread } = get();
    if (!thread || thread.id !== threadId) return;
    set({ thread: { ...thread, ...patch } });
  };

  const flush = () => {
    // Called by the timer AND directly from finish() — clear any pending timer
    // so a stray late firing can't flush into the next stream's message.
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!live) return;
    const { text, thinking } = pending;
    pending = { text: "", thinking: "" };
    if (!text && !thinking) return;
    patchMessage(live.threadId, live.messageId, (m) => ({
      ...m,
      content: m.content + text,
      thinking: thinking ? (m.thinking ?? "") + thinking : m.thinking,
    }));
  };

  const queueFlush = () => {
    if (flushTimer == null) flushTimer = window.setTimeout(flush, 40);
  };

  /** Close out the live stream (done, error, or local stop). */
  const finish = () => {
    flush();
    if (live) {
      // A finished turn leaves no tool running — anything still marked so was
      // interrupted; "unknown" beats a spinner stuck forever.
      patchMessage(live.threadId, live.messageId, (m) =>
        m.actions.some((a) => a.status === "running")
          ? {
              ...m,
              actions: m.actions.map((a) =>
                a.status === "running" ? { ...a, status: null } : a,
              ),
            }
          : m,
      );
    }
    live = null;
    set({ streaming: false });
    persist(get);
  };

  return {
    loaded: false,
    metas: [],
    projects: [],
    thread: null,
    activeProjectId: null,
    provider: prefs.provider,
    model: prefs.model,
    effort: prefs.effort,
    access: prefs.access,
    streaming: false,

    init: async () => {
      if (get().loaded) return;
      set({ loaded: true });
      try {
        const [metas, projects] = await Promise.all([api.listChats(), api.listChatProjects()]);
        set({ metas, projects });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    setModel: (provider, model) => {
      saveChatPrefs({ provider, model, effort: get().effort, access: get().access });
      set({ provider, model });
    },

    setEffort: (effort) => {
      const { provider, model, access } = get();
      saveChatPrefs({ provider, model, effort, access });
      set({ effort });
    },

    setAccess: (access) => {
      const { provider, model, effort } = get();
      saveChatPrefs({ provider, model, effort, access });
      set({ access });
    },

    newThread: (projectId) => {
      if (get().streaming) get().stop();
      set({
        thread: null,
        ...(projectId !== undefined ? { activeProjectId: projectId } : null),
      });
    },

    openThread: async (id) => {
      if (get().thread?.id === id) return;
      if (get().streaming) get().stop();
      try {
        const full = await api.getChat(id);
        if (!full) return;
        set({
          thread: {
            id: full.meta.id,
            title: full.meta.title,
            titleAuto: false,
            claudeSessionId: full.meta.claudeSessionId,
            codexSessionId: full.meta.codexSessionId,
            projectId: full.meta.projectId,
            messages: full.messages,
          },
          activeProjectId: full.meta.projectId,
        });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    removeThread: async (id) => {
      // Drop the active thread from state BEFORE stopping: stop() persists,
      // and a save racing the delete below would resurrect the thread.
      if (get().thread?.id === id) {
        set({ thread: null });
        if (get().streaming) get().stop();
      }
      try {
        const metas = await api.deleteChat(id);
        set({ metas });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    renameThread: async (id, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const { thread } = get();
      try {
        if (thread?.id === id) {
          set({ thread: { ...thread, title: trimmed, titleAuto: false } });
          persist(get);
          return;
        }
        // Threads are persisted whole — load, retitle, save back.
        const full = await api.getChat(id);
        if (!full) return;
        const metas = await api.saveChat({
          id: full.meta.id,
          title: trimmed,
          provider: full.meta.provider,
          model: full.meta.model,
          claudeSessionId: full.meta.claudeSessionId,
          codexSessionId: full.meta.codexSessionId,
          projectId: full.meta.projectId,
          messages: full.messages,
        });
        set({ metas });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    moveThread: async (id, projectId) => {
      try {
        const metas = await api.setChatProject(id, projectId);
        const { thread } = get();
        set({
          metas,
          // Keep the open thread (and its persist payload) in sync.
          ...(thread?.id === id ? { thread: { ...thread, projectId }, activeProjectId: projectId } : null),
        });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    addProject: async () => {
      const selected = await open({ directory: true, title: "Add a project folder" });
      if (typeof selected !== "string") return;
      // Same folder again → just land in the existing project. Windows paths
      // are case-insensitive; trailing separators don't make a new folder.
      const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
      const existing = get().projects.find((p) => p.path && norm(p.path) === norm(selected));
      if (existing) {
        toast(`“${existing.name}” is already a project`);
        get().newThread(existing.id);
        return;
      }
      const name = selected.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || selected;
      const id = crypto.randomUUID();
      try {
        const projects = await api.saveChatProject({
          id,
          name,
          instructions: "",
          path: selected,
          createdAt: 0, // assigned by the backend on insert
          updatedAt: 0,
        });
        set({ projects });
        // Land in the new project with a fresh hero.
        get().newThread(id);
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    updateProject: async (id, patch) => {
      const current = get().projects.find((p) => p.id === id);
      if (!current) return;
      const next = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name.trim() || current.name } : null),
        ...(patch.instructions !== undefined ? { instructions: patch.instructions } : null),
      };
      try {
        set({ projects: await api.saveChatProject(next) });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    removeProject: async (id) => {
      try {
        const [projects, metas] = await api.deleteChatProject(id);
        const { thread, activeProjectId } = get();
        set({
          projects,
          metas,
          ...(activeProjectId === id ? { activeProjectId: null } : null),
          // The open thread survives, ungrouped.
          ...(thread?.projectId === id ? { thread: { ...thread, projectId: null } } : null),
        });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
    },

    setActiveProject: (id) => {
      set({ activeProjectId: id });
    },

    send: async (text) => {
      const trimmed = text.trim();
      if (!trimmed || get().streaming) return;
      const { provider, model, effort } = get();

      const cli = useApp.getState().clis.find((c) => c.kind === CLI_FOR[provider]);
      if (cli && !cli.available) {
        toast(`${PROVIDER_LABEL[provider]} isn't installed — add it from the sidebar`, "error");
        return;
      }

      const now = Date.now();
      const base: ChatThreadState = get().thread ?? {
        id: crypto.randomUUID(),
        title: trimmed.replace(/\s+/g, " ").slice(0, 48),
        titleAuto: true,
        claudeSessionId: null,
        codexSessionId: null,
        projectId: get().activeProjectId,
        messages: [],
      };
      const resume = provider === "anthropic" ? base.claudeSessionId : base.codexSessionId;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        thinking: null,
        provider: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        actions: [],
        createdAt: now,
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        thinking: null,
        provider,
        model,
        inputTokens: null,
        outputTokens: null,
        actions: [],
        createdAt: now,
      };

      const thread: ChatThreadState = {
        ...base,
        messages: [...base.messages, userMsg, assistantMsg],
      };
      set({ thread, streaming: true });
      pending = { text: "", thinking: "" };
      live = { streamId: null, threadId: thread.id, messageId: assistantMsg.id, closed: false };
      persist(get);

      const mine = live;
      const channel = new Channel<ChatStreamMsg>();
      channel.onmessage = (msg) => {
        if (!live || live !== mine || mine.closed) return; // stale stream
        switch (msg.kind) {
          case "delta":
            pending.text += msg.text;
            queueFlush();
            break;
          case "thinking":
            pending.thinking += msg.text;
            queueFlush();
            break;
          case "action":
            // Rare events — append straight through (text rides the flush buffer).
            patchMessage(mine.threadId, mine.messageId, (m) => ({
              ...m,
              actions: [...m.actions, msg.action],
            }));
            break;
          case "actionUpdate":
            // A tool finished — settle its row (matched by tool-call id).
            patchMessage(mine.threadId, mine.messageId, (m) => ({
              ...m,
              actions: m.actions.map((a) =>
                a.id === msg.id ? { ...a, status: msg.status, output: msg.output ?? a.output } : a,
              ),
            }));
            break;
          case "session":
            // Arrives every turn — keep whatever id the CLI reported last.
            patchThread(
              mine.threadId,
              provider === "anthropic" ? { claudeSessionId: msg.id } : { codexSessionId: msg.id },
            );
            break;
          case "usage":
            patchMessage(mine.threadId, mine.messageId, (m) => ({
              ...m,
              inputTokens: msg.inputTokens ?? m.inputTokens,
              outputTokens: msg.outputTokens ?? m.outputTokens,
            }));
            break;
          case "done":
            mine.closed = true;
            if (msg.stopReason === "refusal") {
              patchMessage(mine.threadId, mine.messageId, (m) => ({
                ...m,
                content: m.content || "> Request declined by the model's safety classifiers.",
              }));
            }
            finish();
            break;
          case "error": {
            mine.closed = true;
            const message = msg.message + authHint(provider, msg.message);
            // Drop the dead session so the next turn starts fresh (its
            // history is re-embedded into the prompt).
            patchThread(
              mine.threadId,
              provider === "anthropic" ? { claudeSessionId: null } : { codexSessionId: null },
            );
            patchMessage(mine.threadId, mine.messageId, (m) => ({
              ...m,
              content: m.content || `> ⚠ ${message}`,
            }));
            toast(message, "error");
            finish();
            break;
          }
        }
      };

      // Clamp the stored effort to what the selected model accepts; the
      // "ultrathink" level is Claude Code's prompt keyword, not a flag.
      const turnEffort = effectiveEffort(provider, model, effort);
      // Fresh CLI sessions get the project instructions + recent history in
      // the prompt; resumed sessions already carry both server-side.
      const project = get().projects.find((p) => p.id === base.projectId);
      const basePrompt = resume
        ? trimmed
        : instructionsPreamble(project) + historyPreamble(base.messages) + trimmed;
      const prompt =
        provider === "anthropic" && turnEffort === "ultrathink"
          ? `Ultrathink:\n${basePrompt}`
          : basePrompt;

      try {
        const streamId = await api.chatStream(
          {
            provider,
            model: model || null,
            prompt,
            resume,
            effort: wireEffort(provider, turnEffort),
            // Project chats run in their folder (the CLI can read the code
            // there); ungrouped chats stay in a neutral cwd.
            cwd: project?.path || null,
            access: resolveAccess(get().access, !!project?.path),
          },
          channel,
        );
        if (mine.closed) {
          // Stopped before the stream id arrived — reap the orphaned CLI run.
          void api.chatCancel(streamId).catch(() => {});
        } else if (live === mine) {
          mine.streamId = streamId;
        }
      } catch (e) {
        if (mine.closed) return;
        mine.closed = true;
        patchMessage(mine.threadId, mine.messageId, (m) => ({
          ...m,
          content: m.content || `> ⚠ ${errorMessage(e)}`,
        }));
        toast(errorMessage(e), "error");
        finish();
      }
    },

    stop: () => {
      if (!live || live.closed) return;
      live.closed = true;
      if (live.streamId) api.chatCancel(live.streamId).catch(() => {});
      finish();
    },
  };
});
