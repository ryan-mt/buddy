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

export const api = {
  listClis: () => invoke<CliInfo[]>("list_clis"),

  installSpecs: () => invoke<InstallSpec[]>("install_specs"),

  nodeStatus: () => invoke<NodeStatus>("node_status"),

  installCli: (opts: InstallOpts, channel: Channel<TerminalMsg>) =>
    invoke<string>("install_cli", { opts, channel }),

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
};

export { Channel };
