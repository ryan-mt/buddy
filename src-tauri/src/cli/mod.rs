//! Integration with locally installed agent CLIs (Claude Code, Codex, …).

pub mod detect;
pub mod env;
pub mod install;
pub mod projects_fs;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A supported agent CLI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CliKind {
    Claude,
    Codex,
    Opencode,
    Gemini,
    Grok,
}

impl CliKind {
    pub const ALL: [CliKind; 5] = [
        CliKind::Claude,
        CliKind::Codex,
        CliKind::Opencode,
        CliKind::Gemini,
        CliKind::Grok,
    ];

    /// Base binary name (without platform extension).
    pub fn binary(self) -> &'static str {
        match self {
            CliKind::Claude => "claude",
            CliKind::Codex => "codex",
            CliKind::Opencode => "opencode",
            CliKind::Gemini => "gemini",
            CliKind::Grok => "grok",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            CliKind::Claude => "Claude Code",
            CliKind::Codex => "Codex",
            CliKind::Opencode => "opencode",
            CliKind::Gemini => "Gemini",
            CliKind::Grok => "Grok",
        }
    }

    /// Stable lowercase tag used to persist the kind (matches the serde repr).
    pub fn as_str(self) -> &'static str {
        match self {
            CliKind::Claude => "claude",
            CliKind::Codex => "codex",
            CliKind::Opencode => "opencode",
            CliKind::Gemini => "gemini",
            CliKind::Grok => "grok",
        }
    }
}

/// Result of locating a CLI on the machine.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    pub kind: CliKind,
    pub label: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

/// Build the launch arguments for an interactive session. Each CLI exposes a
/// different surface (verified against its docs / `--help`), so the flags are
/// applied per-kind; `None` values fall back to the CLI's own defaults.
pub fn session_args(
    kind: CliKind,
    session_id: Uuid,
    model: Option<&str>,
    permission_mode: Option<&str>,
    effort: Option<&str>,
    resume: bool,
) -> Vec<String> {
    match kind {
        // New: claude --session-id <uuid> …   Resume: claude --resume <uuid> …
        // effort ∈ {low, medium, high, xhigh, max}
        CliKind::Claude => {
            let flag = if resume { "--resume" } else { "--session-id" };
            let mut args = vec![flag.to_string(), session_id.to_string()];
            if let Some(model) = model {
                args.push("--model".to_string());
                args.push(model.to_string());
            }
            if let Some(mode) = permission_mode {
                args.push("--permission-mode".to_string());
                args.push(mode.to_string());
            }
            if let Some(effort) = effort {
                args.push("--effort".to_string());
                args.push(effort.to_string());
            }
            args
        }
        // codex [-m model] [-c model_reasoning_effort=<minimal|low|medium|high>]
        CliKind::Codex => {
            let mut args = Vec::new();
            if let Some(model) = model {
                args.push("-m".to_string());
                args.push(model.to_string());
            }
            if let Some(effort) = effort {
                args.push("-c".to_string());
                args.push(format!("model_reasoning_effort={effort}"));
            }
            args
        }
        // gemini [-m <auto|pro|flash|flash-lite|full-name>]; thinking is set in-TUI.
        CliKind::Gemini => match model {
            Some(model) => vec!["-m".to_string(), model.to_string()],
            None => Vec::new(),
        },
        // Launch interactively in the PTY's cwd; model/agent are chosen in the TUI.
        CliKind::Opencode | CliKind::Grok => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_new_session_uses_session_id() {
        let args = session_args(
            CliKind::Claude,
            Uuid::nil(),
            Some("opus"),
            Some("plan"),
            Some("max"),
            false,
        );
        assert_eq!(args[0], "--session-id");
        assert!(args.iter().any(|a| a == "--model"));
        assert!(args.iter().any(|a| a == "opus"));
        assert!(args.iter().any(|a| a == "--permission-mode"));
        assert!(args.iter().any(|a| a == "--effort"));
    }

    #[test]
    fn claude_resume_uses_resume_flag() {
        let args = session_args(CliKind::Claude, Uuid::nil(), None, None, None, true);
        assert_eq!(args[0], "--resume");
    }

    #[test]
    fn codex_maps_effort_to_config() {
        let args = session_args(
            CliKind::Codex,
            Uuid::nil(),
            Some("o3"),
            None,
            Some("high"),
            false,
        );
        assert_eq!(args, vec!["-m", "o3", "-c", "model_reasoning_effort=high"]);
    }

    #[test]
    fn as_str_is_lowercase_tag() {
        assert_eq!(CliKind::Claude.as_str(), "claude");
        assert_eq!(CliKind::Opencode.as_str(), "opencode");
        assert_eq!(CliKind::Grok.as_str(), "grok");
    }
}
