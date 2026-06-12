// Last-used chat model/effort/access, persisted to localStorage (same pattern
// as settings.ts — survives restarts, no backend round-trip).

import type { ChatProvider } from "./bindings";
import {
  ACCESS_LEVELS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  EFFORT_LEVELS,
  type Access,
  type Effort,
} from "./chatModels";

export interface ChatPrefs {
  provider: ChatProvider;
  model: string;
  effort: Effort;
  access: Access;
}

const KEY = "buddy-chat-model";

const DEFAULT_PREFS: ChatPrefs = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  effort: "auto",
  access: "auto",
};

/** Coerce a persisted payload into valid prefs. model "" is valid — it means
 *  "the CLI's default model". Guard the enums: a stale/corrupted value would
 *  crash the keyed UI. */
export function sanitizeChatPrefs(parsed: Partial<ChatPrefs>): ChatPrefs {
  const provider =
    parsed.provider === "anthropic" || parsed.provider === "openai" ? parsed.provider : null;
  if (!provider || typeof parsed.model !== "string") return DEFAULT_PREFS;
  const effort = EFFORT_LEVELS.some((l) => l.value === parsed.effort)
    ? (parsed.effort as Effort)
    : "auto";
  const access = ACCESS_LEVELS.some((l) => l.value === parsed.access)
    ? (parsed.access as Access)
    : "auto";
  return { provider, model: parsed.model, effort, access };
}

export function loadChatPrefs(): ChatPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeChatPrefs(JSON.parse(raw) as Partial<ChatPrefs>);
  } catch {
    // fall through to defaults
  }
  return DEFAULT_PREFS;
}

export function saveChatPrefs(prefs: ChatPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // ignore persistence failures
  }
}
