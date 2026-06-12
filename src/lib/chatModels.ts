// Model catalog for the built-in chat. Conversations run through the locally
// installed agent CLIs in headless mode (claude -p / codex exec), so models
// here are CLI model ids — and the empty id means "whatever the CLI's own
// default is", which is the most dependable choice.
//
// Ids verified June 2026 against the installed CLIs and their official docs.

import type { ComponentType } from "react";
import { LogoClaude, LogoCodex } from "../components/icons";
import type { ChatProvider } from "./bindings";

interface LogoProps {
  size?: number;
  className?: string;
}

/** Sentinel model id: let the CLI use its own configured default. */
export const CLI_DEFAULT_MODEL = "";

export const PROVIDER_LABEL: Record<ChatProvider, string> = {
  anthropic: "Claude Code",
  openai: "Codex",
};

/** buddy's own palette (same hues the CLI list uses), not vendor brand colors. */
export const PROVIDER_COLOR: Record<ChatProvider, string> = {
  anthropic: "var(--color-claude)",
  openai: "var(--color-codex)",
};

export const PROVIDER_LOGO: Record<ChatProvider, ComponentType<LogoProps>> = {
  anthropic: LogoClaude,
  openai: LogoCodex,
};

export const PROVIDERS: ChatProvider[] = ["anthropic", "openai"];

export type Effort =
  | "auto"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultrathink"
  | "ultracode";

/** Tool access for a chat turn. "auto" = read-only in projects, chat outside. */
export type Access = "auto" | "chat" | "read" | "full";

export const ACCESS_LEVELS: { value: Access; label: string; note: string }[] = [
  { value: "auto", label: "Auto", note: "Read-only in projects" },
  { value: "chat", label: "Chat only", note: "No tools" },
  { value: "read", label: "Read-only", note: "Read & search files" },
  { value: "full", label: "Full access", note: "Edit files, run commands" },
];

/** The wire value for a turn — "auto" resolves against the project context. */
export function resolveAccess(access: Access, hasProject: boolean): "chat" | "read" | "full" {
  if (access === "auto") return hasProject ? "read" : "chat";
  return access;
}

// Per-model effort ladders, mirroring what each model actually accepts
// (Claude Code --effort takes low…max; ultrathink rides the prompt keyword,
// ultracode maps to xhigh + the ultracode settings flag in the backend):
//   Fable 5            — thinking is always on, so no ultrathink keyword.
//   Opus 4.8           — the full ladder.
//   Opus 4.6 / Sonnet 4.6 — no xhigh, hence no ultracode either.
//   Haiku 4.5          — no effort dial at all.
const FABLE_EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max", "ultracode"];
const FLAGSHIP_EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max", "ultrathink", "ultracode"];
const EXTENDED_EFFORTS: Effort[] = ["low", "medium", "high", "max", "ultrathink"];
const SAFE_EFFORTS: Effort[] = ["low", "medium", "high", "ultrathink"];
const OPENAI_EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface ChatModel {
  id: string;
  label: string;
  /** One-line descriptor shown in the picker. */
  note: string;
  /** Effort levels this model accepts ("auto" is always offered). Empty = no dial. */
  efforts: Effort[];
}

export const CHAT_MODELS: Record<ChatProvider, ChatModel[]> = {
  anthropic: [
    { id: CLI_DEFAULT_MODEL, label: "Default", note: "Your Claude Code setting", efforts: FLAGSHIP_EFFORTS },
    { id: "claude-fable-5", label: "Fable 5", note: "Most capable, frontier", efforts: FABLE_EFFORTS },
    { id: "claude-opus-4-8", label: "Opus 4.8", note: "Deep work", efforts: FLAGSHIP_EFFORTS },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "Fast, balanced", efforts: EXTENDED_EFFORTS },
    { id: "claude-haiku-4-5", label: "Haiku 4.5", note: "Instant answers", efforts: [] },
  ],
  openai: [
    { id: CLI_DEFAULT_MODEL, label: "Default", note: "Your Codex setting", efforts: OPENAI_EFFORTS },
    { id: "gpt-5.5", label: "GPT-5.5", note: "Frontier coding & research", efforts: OPENAI_EFFORTS },
    { id: "gpt-5.4", label: "GPT-5.4", note: "Flagship all-rounder", efforts: OPENAI_EFFORTS },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini", note: "Fast & light", efforts: OPENAI_EFFORTS },
    // Research preview (ChatGPT Pro) tuned for instant replies — no effort dial.
    { id: "gpt-5.3-codex-spark", label: "Codex Spark", note: "Near-instant, Pro preview", efforts: [] },
  ],
};

export const DEFAULT_PROVIDER: ChatProvider = "anthropic";
export const DEFAULT_MODEL = CLI_DEFAULT_MODEL;

export const EFFORT_LEVELS: { value: Effort; label: string; note?: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "X-High" },
  { value: "max", label: "Max" },
  { value: "ultrathink", label: "Ultrathink", note: "Max thinking budget" },
  { value: "ultracode", label: "Ultracode", note: "X-High + workflows" },
];

export function findModel(provider: ChatProvider, id: string): ChatModel | undefined {
  return CHAT_MODELS[provider].find((m) => m.id === id);
}

/** Display label for a model id — falls back to the raw id (custom models). */
export function modelLabel(provider: ChatProvider, id: string): string {
  if (id === CLI_DEFAULT_MODEL) return "Default";
  return findModel(provider, id)?.label ?? id;
}

/** Effort levels a model accepts — custom ids fall back to safe prefixes. */
export function effortsFor(provider: ChatProvider, model: string): Effort[] {
  const known = findModel(provider, model);
  if (known) return known.efforts;
  if (provider === "openai") return OPENAI_EFFORTS;
  if (model.startsWith("claude-haiku")) return [];
  if (model.startsWith("claude-fable") || model.startsWith("claude-mythos")) return FABLE_EFFORTS;
  if (model.startsWith("claude-opus-4-8") || model.startsWith("claude-opus-4-7")) return FLAGSHIP_EFFORTS;
  if (model.startsWith("claude-opus-4-6") || model.startsWith("claude-sonnet-4-6")) return EXTENDED_EFFORTS;
  return SAFE_EFFORTS;
}

/** The stored effort, or "auto" when the selected model doesn't accept it. */
export function effectiveEffort(provider: ChatProvider, model: string, effort: Effort): Effort {
  if (effort === "auto") return "auto";
  return effortsFor(provider, model).includes(effort) ? effort : "auto";
}

/**
 * Map the UI effort level to the CLI's wire value (null = omit, the CLI's
 * default applies). Claude takes `--effort low…max` — "ultrathink" rides the
 * prompt keyword instead (no flag), and "ultracode" is resolved to
 * xhigh + the ultracode settings flag by the backend. Codex takes
 * `model_reasoning_effort` which tops out at "xhigh".
 */
export function wireEffort(provider: ChatProvider, effort: Effort): string | null {
  if (effort === "auto") return null;
  if (provider === "openai") return effort === "max" ? "xhigh" : effort;
  return effort === "ultrathink" ? null : effort;
}

/** Whether the effort dial applies to this model. */
export function supportsEffort(provider: ChatProvider, model: string): boolean {
  return effortsFor(provider, model).length > 0;
}
