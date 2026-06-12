// Typed wrappers over the Tauri command surface. Kept in sync by hand with the
// `#[tauri::command]` functions in `src-tauri/src/commands`.

import { invoke, Channel } from "@tauri-apps/api/core";

export type CliKind = "claude" | "codex" | "opencode" | "gemini" | "grok";

/** Result of locating a CLI (mirrors Rust `CliInfo`). */
export interface CliInfo {
  kind: CliKind;
  label: string;
  available: boolean;
  path: string | null;
  version: string | null;
}

/** Streamed from a PTY session. Mirrors the Rust `TerminalMsg` enum. */
export type TerminalMsg =
  | { kind: "output"; data: string } // base64-encoded bytes
  | { kind: "exit"; code: number | null };

export interface StartTerminalOpts {
  cli: CliKind;
  cwd?: string | null;
  model?: string | null;
  permissionMode?: string | null;
  effort?: string | null;
  profileId?: string | null;
  title?: string | null;
  /** Reopen this prior session id instead of minting a new one (Claude resume). */
  resumeId?: string | null;
  rows: number;
  cols: number;
}

/** How to install one CLI on this OS (mirrors Rust `InstallSpec`). */
export interface InstallSpec {
  kind: CliKind;
  supported: boolean;
  command: string;
  requiresNode: boolean;
  note: string | null;
}

/** One installed CLI vs its latest release (mirrors Rust `CliUpdateInfo`). */
export interface CliUpdateInfo {
  kind: CliKind;
  /** Raw `--version` output of the installed binary. */
  installed: string;
  /** Latest release on the npm registry. */
  latest: string;
  hasUpdate: boolean;
}

/** Node.js / npm availability (mirrors Rust `NodeStatus`). */
export interface NodeStatus {
  node: boolean;
  npm: boolean;
  hint: string;
}

export interface InstallOpts {
  cli: CliKind;
  rows: number;
  cols: number;
}

/** One changed file in a git working tree (mirrors Rust `GitChange`). */
export interface GitChange {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked" | "conflicted";
  /** Lines added/removed; null when unknown (binary or too large to count). */
  added: number | null;
  removed: number | null;
  binary: boolean;
}

/** A working tree's changes versus HEAD (mirrors Rust `GitChanges`). */
export interface GitChanges {
  branch: string;
  files: GitChange[];
  added: number;
  removed: number;
}

/** One rendered diff line (mirrors Rust `DiffRow`). */
export interface DiffRow {
  kind: "context" | "add" | "del";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

/** A file's full diff, render-ready (mirrors Rust `FileDiff`). */
export interface FileDiff {
  rows: DiffRow[];
  binary: boolean;
  truncated: boolean;
}

/** A single entry in a directory listing (mirrors Rust `DirEntry`). */
export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

/** A persisted project folder (mirrors Rust `db::Project`). */
export interface Project {
  id: string;
  name: string;
  path: string;
}

/** A named, isolated CLI configuration (mirrors Rust `db::Profile`). */
export interface Profile {
  id: string;
  name: string;
  color: string;
  configDir: string;
  model: string | null;
  baseUrl: string | null;
}

/** Editable profile fields (mirrors Rust `ProfileInput`). */
export interface ProfileInput {
  name: string;
  color: string;
  model?: string | null;
  baseUrl?: string | null;
}

/** A recorded session in history (mirrors Rust `db::SessionRecord`). */
export interface SessionRecord {
  id: string;
  cli: CliKind;
  title: string;
  cwd: string | null;
  profileId: string | null;
  model: string | null;
  permissionMode: string | null;
  effort: string | null;
  status: "running" | "exited";
  exitCode: number | null;
  createdAt: number;
  lastActiveAt: number;
}

/** A Claude session found on disk, offered for resume (mirrors `ResumableSession`). */
export interface ResumableSession {
  id: string;
  cwd: string | null;
  modified: number;
  preview: string | null;
}

/** One flattened transcript line (mirrors Rust `TranscriptEntry`). */
export interface TranscriptEntry {
  role: string;
  text: string;
  timestamp: string | null;
  tokens: number | null;
}

/** Shape of every error returned by a command (mirrors Rust `AppError`). */
export interface AppError {
  code: string;
  message: string;
}

// --- built-in chat (drives the local agent CLIs headless) ---

export type ChatProvider = "anthropic" | "openai";
export type ChatRole = "user" | "assistant";

/** One item of the agent's TodoWrite plan (mirrors Rust `TodoItem`). */
export interface TodoItem {
  content: string;
  /** "pending" | "in_progress" | "completed". */
  status: string;
}

/** One tool the agent used during a turn (mirrors Rust `ChatAction`).
 *  Fields beyond label/detail are absent on rows persisted before they existed. */
export interface ChatAction {
  label: string;
  detail: string;
  /** Tool-call id (Claude tool_use id / Codex item id); ties results back. */
  id?: string | null;
  /** Owning Task tool id — subagent actions render nested under it. */
  parentId?: string | null;
  /** "running" | "ok" | "error"; null = unknown (legacy or interrupted turn). */
  status?: string | null;
  /** Short tool-result preview (command output, error text, …). */
  output?: string | null;
  /** TodoWrite snapshot — rendered as the plan checklist. */
  todos?: TodoItem[] | null;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  thinking: string | null;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Tool-action timeline shown above the reply. */
  actions: ChatAction[];
  createdAt: number;
}

/** A chat project: a folder on disk grouping threads — chats inside run their
 *  CLI turns with the folder as cwd, plus instructions injected at session
 *  start (mirrors Rust `db::ChatProject`). */
export interface ChatProject {
  id: string;
  name: string;
  instructions: string;
  /** Absolute folder path; "" for legacy name-only projects. */
  path: string;
  createdAt: number;
  updatedAt: number;
}

/** Thread summary for the sidebar (mirrors Rust `db::ChatMeta`). */
export interface ChatMeta {
  id: string;
  title: string;
  provider: string;
  model: string;
  /** Claude Code session resumed on the next turn of this thread. */
  claudeSessionId: string | null;
  /** Codex thread resumed on the next turn of this thread. */
  codexSessionId: string | null;
  /** Owning chat project; null = ungrouped. */
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** A fully loaded thread (mirrors Rust `db::ChatThread`). */
export interface ChatThreadFull {
  meta: ChatMeta;
  messages: ChatMessage[];
}

/** Streamed from an in-flight turn. Mirrors the Rust `ChatMsg` enum. */
export type ChatStreamMsg =
  | { kind: "delta"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "action"; action: ChatAction }
  | { kind: "actionUpdate"; id: string; status: string; output: string | null }
  | { kind: "session"; id: string }
  | { kind: "usage"; inputTokens: number | null; outputTokens: number | null }
  | { kind: "done"; stopReason: string | null; cancelled: boolean }
  | { kind: "error"; message: string };

export interface ChatStreamOpts {
  provider: ChatProvider;
  /** null/empty = the CLI's own configured default model. */
  model: string | null;
  /** This turn's prompt (history rides in the CLI session). */
  prompt: string;
  /** CLI session/thread id from the previous turn, if any. */
  resume: string | null;
  /** CLI effort value (already mapped); omit for the CLI default. */
  effort?: string | null;
  /** Working directory for the turn — the chat project's folder, if any. */
  cwd?: string | null;
  /** Tool access: "chat" (none), "read" (read-only), "full" (everything). */
  access?: "chat" | "read" | "full" | null;
}

export const api = {
  listClis: () => invoke<CliInfo[]>("list_clis"),

  installSpecs: () => invoke<InstallSpec[]>("install_specs"),

  nodeStatus: () => invoke<NodeStatus>("node_status"),

  installCli: (opts: InstallOpts, channel: Channel<TerminalMsg>) =>
    invoke<string>("install_cli", { opts, channel }),

  checkCliUpdates: () => invoke<CliUpdateInfo[]>("check_cli_updates"),

  /** Re-runs the vendor's install command; resolves with the refreshed info. */
  updateCli: (cli: CliKind) => invoke<CliInfo>("update_cli", { cli }),

  startTerminal: (opts: StartTerminalOpts, channel: Channel<TerminalMsg>) =>
    invoke<string>("start_terminal", { opts, channel }),

  writeTerminal: (id: string, data: string) =>
    invoke<void>("write_terminal", { id, data }),

  resizeTerminal: (id: string, rows: number, cols: number) =>
    invoke<void>("resize_terminal", { id, rows, cols }),

  killTerminal: (id: string) => invoke<void>("kill_terminal", { id }),

  readDir: (path: string) => invoke<DirEntry[]>("read_dir", { path }),

  readFile: (path: string) => invoke<string>("read_file", { path }),

  writeFile: (path: string, content: string) =>
    invoke<void>("write_file", { path, content }),

  listProjects: () => invoke<Project[]>("list_projects"),

  addProject: (path: string) => invoke<Project[]>("add_project", { path }),

  removeProject: (id: string) => invoke<Project[]>("remove_project", { id }),

  /** Open the OS file manager at a folder (or reveal a file selected). */
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),

  /** Open buddy's data folder (database, profiles) in the OS file manager. */
  revealDataDir: () => invoke<void>("reveal_data_dir"),

  /** Working-tree changes (status + line counts) for a git repository. */
  gitChanges: (root: string) => invoke<GitChanges>("git_changes", { root }),

  /** One file's diff as render-ready rows. */
  gitFileDiff: (root: string, path: string, untracked: boolean) =>
    invoke<FileDiff>("git_file_diff", { root, path, untracked }),

  listProfiles: () => invoke<Profile[]>("list_profiles"),

  addProfile: (input: ProfileInput) => invoke<Profile[]>("add_profile", { input }),

  updateProfile: (id: string, input: ProfileInput) =>
    invoke<Profile[]>("update_profile", { id, input }),

  removeProfile: (id: string) => invoke<Profile[]>("remove_profile", { id }),

  listSessions: () => invoke<SessionRecord[]>("list_sessions"),

  renameSession: (id: string, title: string) =>
    invoke<SessionRecord[]>("rename_session", { id, title }),

  removeSession: (id: string) => invoke<SessionRecord[]>("remove_session", { id }),

  clearSessions: () => invoke<SessionRecord[]>("clear_sessions"),

  listResumable: (profile?: string | null) =>
    invoke<ResumableSession[]>("list_resumable", { profile: profile ?? null }),

  readTranscript: (id: string) => invoke<TranscriptEntry[]>("read_transcript", { id }),

  listChats: () => invoke<ChatMeta[]>("list_chats"),

  getChat: (id: string) => invoke<ChatThreadFull | null>("get_chat", { id }),

  saveChat: (chat: {
    id: string;
    title: string;
    provider: string;
    model: string;
    claudeSessionId: string | null;
    codexSessionId: string | null;
    projectId: string | null;
    messages: ChatMessage[];
  }) => invoke<ChatMeta[]>("save_chat", { chat }),

  deleteChat: (id: string) => invoke<ChatMeta[]>("delete_chat", { id }),

  listChatProjects: () => invoke<ChatProject[]>("list_chat_projects"),

  saveChatProject: (project: ChatProject) =>
    invoke<ChatProject[]>("save_chat_project", { project }),

  /** Returns [projects, metas] — deleting ungroups the project's threads. */
  deleteChatProject: (id: string) =>
    invoke<[ChatProject[], ChatMeta[]]>("delete_chat_project", { id }),

  setChatProject: (chatId: string, projectId: string | null) =>
    invoke<ChatMeta[]>("set_chat_project", { chatId, projectId }),

  chatStream: (opts: ChatStreamOpts, channel: Channel<ChatStreamMsg>) =>
    invoke<string>("chat_stream", { opts, channel }),

  chatCancel: (id: string) => invoke<void>("chat_cancel", { id }),
};

export { Channel };
