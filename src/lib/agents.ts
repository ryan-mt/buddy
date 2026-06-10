import type { ComponentType } from "react";
import { LogoClaude, LogoCodex, LogoGemini, LogoGrok, LogoOpencode } from "../components/icons";
import type { CliKind } from "./bindings";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Per-agent accent (buddy's own palette — deliberately NOT the vendors' brand
 * colors). CSS variables are defined in index.css and switch with the theme.
 */
export const AGENT_COLOR: Record<CliKind, string> = {
  claude: "var(--color-claude)",
  codex: "var(--color-codex)",
  opencode: "var(--color-opencode)",
  gemini: "var(--color-gemini)",
  grok: "var(--color-grok)",
};

export const AGENT_LABEL: Record<CliKind, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "opencode",
  gemini: "Gemini",
  grok: "Grok",
};

/** Each CLI's real brand mark (tinted by AGENT_COLOR at the call site). */
export const AGENT_LOGO: Record<CliKind, ComponentType<LogoProps>> = {
  claude: LogoClaude,
  codex: LogoCodex,
  opencode: LogoOpencode,
  gemini: LogoGemini,
  grok: LogoGrok,
};

export interface CliOption {
  value: string;
  label: string;
}

/** Which launch controls a CLI exposes (drives the adaptive New Session modal). */
export interface CliCaps {
  models?: CliOption[];
  permissions?: CliOption[];
  /** Reasoning / effort level. */
  effort?: CliOption[];
}

const DEFAULT: CliOption = { value: "default", label: "Default" };
/** Sentinel: the modal reveals a free-text field so the user types an exact
 *  model name. Using official aliases + this keeps the list real yet stable. */
export const CUSTOM: CliOption = { value: "custom", label: "Custom…" };

// Verified against each CLI's docs / `--help`. Model lists use official aliases
// (auto-resolve to the latest real model) plus Custom… for an exact name.
// Values other than "default"/"custom" pass straight through to the launch args.
export const CLI_CAPS: Record<CliKind, CliCaps> = {
  // claude --model / --permission-mode / --effort (max == "ultra" thinking)
  claude: {
    models: [
      DEFAULT,
      { value: "opus", label: "Opus" },
      { value: "sonnet", label: "Sonnet" },
      { value: "haiku", label: "Haiku" },
      CUSTOM,
    ],
    permissions: [
      DEFAULT,
      { value: "plan", label: "Plan" },
      { value: "acceptEdits", label: "Accept edits" },
      { value: "auto", label: "Auto" },
      { value: "dontAsk", label: "Don't ask" },
      { value: "bypassPermissions", label: "Bypass" },
    ],
    effort: [
      DEFAULT,
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "X-High" },
      { value: "max", label: "Max (ultra)" },
    ],
  },
  // codex -m <model> / -c model_reasoning_effort=<level>
  codex: {
    models: [DEFAULT, CUSTOM],
    effort: [
      DEFAULT,
      { value: "minimal", label: "Minimal" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  // gemini -m <alias>; thinking level is set inside the TUI.
  gemini: {
    models: [
      DEFAULT,
      { value: "pro", label: "Pro" },
      { value: "flash", label: "Flash" },
      { value: "flash-lite", label: "Flash-Lite" },
      CUSTOM,
    ],
  },
  // Launched generically; model/agent chosen inside the TUI.
  opencode: {},
  grok: {},
};
