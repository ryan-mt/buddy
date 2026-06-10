import type { CliKind } from "./lib/bindings";

export type { Project, Profile, SessionRecord } from "./lib/bindings";

export type SidebarView = "cli" | "projects" | "profiles" | "history";

export interface SessionTab {
  id: string;
  title: string;
  cli: CliKind;
  cwd?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  profileId?: string;
  /** When resuming, the prior backend session id to reopen. */
  resumeId?: string;
  exited: boolean;
}
