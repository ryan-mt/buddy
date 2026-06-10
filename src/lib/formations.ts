// Formations: named multi-agent layouts (which CLIs, in which split tree, with
// which cwd/model/profile) saved to localStorage and relaunchable in one click.

import type { PaneNode } from "./layout";
import type { CliKind } from "./bindings";

export interface FormationSlot {
  cli: CliKind;
  cwd?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  profileId?: string;
  title?: string;
}

export interface Formation {
  id: string;
  name: string;
  /** The saved split tree; leaf session ids are slot indices ("0", "1", …). */
  layout: PaneNode;
  slots: FormationSlot[];
}

const KEY = "buddy-formations";

export function loadFormations(): Formation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Formation[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveFormations(formations: Formation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(formations));
  } catch {
    // persistence is best-effort
  }
}
