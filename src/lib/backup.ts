// Export/import of buddy's local preferences as one JSON file: settings,
// theme, snippets, formations, and chat prefs. Parsing is defensive
// field-by-field — a hand-edited or older file degrades per section instead of
// failing the whole import.

import { sanitizeSettings, type Settings } from "./settings";
import { sanitizeChatPrefs, type ChatPrefs } from "./chatPrefs";
import type { Formation, FormationSlot } from "./formations";
import type { Snippet } from "./snippets";
import { isTheme, type Theme } from "./theme";
import type { PaneNode } from "./layout";

export interface BackupData {
  settings: Settings;
  theme: Theme;
  snippets: Snippet[];
  formations: Formation[];
  chatPrefs: ChatPrefs;
}

export interface BackupFile extends BackupData {
  app: "buddy";
  /** Bump when the shape changes incompatibly. */
  backupVersion: 1;
  savedAt: string;
}

export function serializeBackup(data: BackupData, savedAt: Date): string {
  const file: BackupFile = { app: "buddy", backupVersion: 1, savedAt: savedAt.toISOString(), ...data };
  return JSON.stringify(file, null, 2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A structurally valid pane tree whose leaves are all valid slot indices. */
function isSlotTree(node: unknown, slotCount: number): node is PaneNode {
  if (!isRecord(node)) return false;
  if (node.kind === "leaf") {
    if (typeof node.sessionId !== "string") return false;
    const idx = Number(node.sessionId);
    return Number.isInteger(idx) && idx >= 0 && idx < slotCount;
  }
  if (node.kind === "split") {
    return (
      typeof node.id === "string" &&
      (node.dir === "row" || node.dir === "col") &&
      typeof node.ratio === "number" &&
      node.ratio > 0 &&
      node.ratio < 1 &&
      isSlotTree(node.a, slotCount) &&
      isSlotTree(node.b, slotCount)
    );
  }
  return false;
}

const CLI_KINDS = new Set(["claude", "codex", "opencode", "gemini", "grok"]);

function sanitizeSlot(raw: unknown): FormationSlot | null {
  if (!isRecord(raw) || typeof raw.cli !== "string" || !CLI_KINDS.has(raw.cli)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    cli: raw.cli as FormationSlot["cli"],
    cwd: str(raw.cwd),
    model: str(raw.model),
    permissionMode: str(raw.permissionMode),
    effort: str(raw.effort),
    profileId: str(raw.profileId),
    title: str(raw.title),
  };
}

/** Valid formations survive, malformed ones are dropped (never the import). */
function sanitizeFormations(raw: unknown): Formation[] {
  if (!Array.isArray(raw)) return [];
  const out: Formation[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
    if (!Array.isArray(item.slots)) continue;
    const slots = item.slots.map(sanitizeSlot);
    if (!slots.length || slots.some((s) => s === null)) continue;
    if (!isSlotTree(item.layout, slots.length)) continue;
    out.push({ id: item.id, name: item.name, layout: item.layout, slots: slots as FormationSlot[] });
  }
  return out;
}

function sanitizeSnippets(raw: unknown): Snippet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is Snippet =>
        isRecord(s) && typeof s.id === "string" && typeof s.text === "string" && s.text.trim() !== "",
    )
    .map((s) => ({ id: s.id, text: s.text }));
}

/**
 * Parse a backup file. Throws with a readable message when the file isn't a
 * buddy backup at all; individual sections degrade to defaults/empty instead.
 */
export function parseBackup(json: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Not a valid JSON file");
  }
  if (!isRecord(raw) || raw.app !== "buddy") {
    throw new Error("Not a buddy backup file");
  }
  if (raw.backupVersion !== 1) {
    throw new Error(`Unsupported backup version (${String(raw.backupVersion)})`);
  }
  return {
    settings: sanitizeSettings(isRecord(raw.settings) ? (raw.settings as Partial<Settings>) : {}),
    theme: isTheme(raw.theme) ? raw.theme : "dark",
    snippets: sanitizeSnippets(raw.snippets),
    formations: sanitizeFormations(raw.formations),
    chatPrefs: sanitizeChatPrefs(isRecord(raw.chatPrefs) ? (raw.chatPrefs as Partial<ChatPrefs>) : {}),
  };
}

/** Short human summary for the import toast: "3 formations, 2 snippets…". */
export function describeBackup(data: BackupData): string {
  const parts = [
    `${data.formations.length} formation${data.formations.length === 1 ? "" : "s"}`,
    `${data.snippets.length} snippet${data.snippets.length === 1 ? "" : "s"}`,
    "settings",
    `${data.theme} theme`,
  ];
  return parts.join(", ");
}
