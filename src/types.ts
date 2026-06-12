import type { CliKind } from "./lib/bindings";

export type { Project, Profile, SessionRecord } from "./lib/bindings";

export type SidebarView = "cli" | "chat" | "projects" | "profiles" | "history";

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
  /** Backend PTY session id, set once the PTY is live. What Claude can resume. */
  ptyId?: string;
  exited: boolean;
  exitCode?: number | null;
  /** Title was derived (folder name / "Session N") — the first real prompt
   *  may replace it. Cleared by any explicit rename. */
  titleAuto?: boolean;
  /** Wall-clock launch time, drives the uptime chip. */
  startedAt?: number;
}

/** Live read on a session: streaming output, or rang the bell while unfocused. */
export type ActivityState = "busy" | "attention";
