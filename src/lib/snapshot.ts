// The last-known workspace (session tabs + split layout), persisted to
// localStorage on every change so a crash or restart can offer to reopen
// everything. Claude sessions resume their conversation via the recorded
// backend session id; other CLIs relaunch fresh with the same configuration.

import type { PaneNode } from "./layout";
import type { SessionTab } from "../types";

export interface WorkspaceSnapshot {
  sessions: SessionTab[];
  layout: PaneNode | null;
}

const KEY = "buddy-workspace";

export function loadSnapshot(): WorkspaceSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as WorkspaceSnapshot;
    if (!Array.isArray(snap.sessions) || snap.sessions.length === 0) return null;
    return snap;
  } catch {
    return null;
  }
}

/** An empty workspace clears the snapshot, so a clean quit offers nothing. */
export function saveSnapshot(snap: WorkspaceSnapshot): void {
  try {
    if (snap.sessions.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // persistence is best-effort
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
