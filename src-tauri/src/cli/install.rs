//! Per-OS install commands for each agent CLI, plus the Node.js prerequisite
//! check. The install itself runs in a PTY (see `commands::install`), reusing
//! the same streaming pipeline as a normal session.

use crate::cli::CliKind;
use serde::Serialize;

/// How to install one CLI on the current OS.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSpec {
    pub kind: CliKind,
    /// Whether buddy can install this CLI on the current OS.
    pub supported: bool,
    /// The exact command shown to the user (and run in the PTY).
    pub command: String,
    /// True when the command needs Node.js / npm on PATH.
    pub requires_node: bool,
    /// Extra guidance (e.g. "use WSL"), shown under the command.
    pub note: Option<String>,
}

fn is_windows() -> bool {
    std::env::consts::OS == "windows"
}

/// The vendor's official install command for `kind` on the current OS, or
/// `None` when there is no supported method here (e.g. Grok on native Windows).
/// Verified against each vendor's docs (2026-06).
fn raw_command(kind: CliKind) -> Option<&'static str> {
    let win = is_windows();
    match kind {
        CliKind::Claude => Some(if win {
            "irm https://claude.ai/install.ps1 | iex"
        } else {
            "curl -fsSL https://claude.ai/install.sh | bash"
        }),
        CliKind::Codex => Some(if win {
            "irm https://chatgpt.com/codex/install.ps1 | iex"
        } else {
            "curl -fsSL https://chatgpt.com/codex/install.sh | sh"
        }),
        CliKind::Opencode => Some(if win {
            // No official Windows script; npm is the documented Windows path.
            "npm install -g opencode-ai"
        } else {
            "curl -fsSL https://opencode.ai/install | bash"
        }),
        // Gemini ships only via npm (and brew on mac); npm is uniform everywhere.
        CliKind::Gemini => Some("npm install -g @google/gemini-cli"),
        CliKind::Grok => {
            if win {
                None
            } else {
                Some("curl -fsSL https://x.ai/cli/install.sh | bash")
            }
        }
    }
}

fn requires_node(kind: CliKind) -> bool {
    match kind {
        CliKind::Gemini => true,
        CliKind::Opencode => is_windows(), // only the Windows path uses npm
        _ => false,
    }
}

fn note(kind: CliKind) -> Option<String> {
    let win = is_windows();
    match kind {
        CliKind::Grok if win => {
            Some("Not supported on native Windows — install inside WSL.".into())
        }
        CliKind::Opencode if win => {
            Some("Needs Node.js. WSL is recommended for the best experience.".into())
        }
        CliKind::Gemini => Some("Needs Node.js (npm).".into()),
        _ => None,
    }
}

/// `raw_command` adjusted for what's actually on this machine: stock Ubuntu
/// (and other minimal distros) ships without curl — fall back to wget when
/// only wget is present. All unix commands share the `curl -fsSL <url> | sh`
/// shape, so a single textual swap is exact.
fn resolved_command(kind: CliKind) -> Option<String> {
    let cmd = raw_command(kind)?.to_string();
    if !is_windows()
        && cmd.starts_with("curl ")
        && which::which("curl").is_err()
        && which::which("wget").is_ok()
    {
        return Some(wget_fallback(&cmd));
    }
    Some(cmd)
}

fn wget_fallback(cmd: &str) -> String {
    cmd.replacen("curl -fsSL", "wget -qO-", 1)
}

/// Build the install spec for one CLI.
pub fn install_spec(kind: CliKind) -> InstallSpec {
    match resolved_command(kind) {
        Some(cmd) => InstallSpec {
            kind,
            supported: true,
            command: cmd,
            requires_node: requires_node(kind),
            note: note(kind),
        },
        None => InstallSpec {
            kind,
            supported: false,
            command: String::new(),
            requires_node: false,
            note: note(kind),
        },
    }
}

/// Install specs for every supported CLI.
pub fn install_specs() -> Vec<InstallSpec> {
    CliKind::ALL.iter().map(|&k| install_spec(k)).collect()
}

/// The user's own shell (zsh/fish keep their login PATH that way); csh/tcsh
/// reject the combined `-lc`, and an unset SHELL falls back to bash.
fn unix_shell() -> String {
    match std::env::var("SHELL") {
        Ok(shell) if !shell.is_empty() && !shell.ends_with("csh") => shell,
        _ => "bash".to_string(),
    }
}

/// The `(program, args)` that run `kind`'s install command inside a PTY on the
/// current OS. `None` when the CLI cannot be installed here.
pub fn shell_invocation(kind: CliKind) -> Option<(String, Vec<String>)> {
    let cmd = resolved_command(kind)?;
    Some(if is_windows() {
        (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-Command".to_string(),
                cmd,
            ],
        )
    } else {
        // Login shell so PATH picks up nvm/Homebrew node for the npm-based CLIs.
        (unix_shell(), vec!["-lc".to_string(), cmd])
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wget_swap_preserves_the_pipeline() {
        assert_eq!(
            wget_fallback("curl -fsSL https://claude.ai/install.sh | bash"),
            "wget -qO- https://claude.ai/install.sh | bash"
        );
        assert_eq!(
            wget_fallback("curl -fsSL https://chatgpt.com/codex/install.sh | sh"),
            "wget -qO- https://chatgpt.com/codex/install.sh | sh"
        );
    }
}
