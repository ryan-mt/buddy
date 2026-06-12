//! Update checking + in-place updates for the agent CLIs. Latest versions come
//! from the npm registry (every CLI but Grok ships an npm package tracking its
//! release line — verified 2026-06); updating re-runs the vendor's official
//! install command, which always installs the latest release.

use crate::cli::{detect, install, CliInfo, CliKind};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

/// npm package tracking each CLI's releases; None = no reliable feed (Grok).
fn npm_package(kind: CliKind) -> Option<&'static str> {
    match kind {
        CliKind::Claude => Some("@anthropic-ai/claude-code"),
        CliKind::Codex => Some("@openai/codex"),
        CliKind::Gemini => Some("@google/gemini-cli"),
        CliKind::Opencode => Some("opencode-ai"),
        CliKind::Grok => None,
    }
}

/// One installed CLI compared against its latest release.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliUpdateInfo {
    pub kind: CliKind,
    /// Raw `--version` output of the installed binary.
    pub installed: String,
    /// Latest release on the npm registry.
    pub latest: String,
    pub has_update: bool,
}

/// First x.y.z run in a version string ("2.1.173 (Claude Code)" → (2,1,173)).
fn parse_semver(text: &str) -> Option<(u64, u64, u64)> {
    for token in text.split(|c: char| !c.is_ascii_digit() && c != '.') {
        let mut parts = token.split('.').filter(|p| !p.is_empty());
        if let (Some(a), Some(b), Some(c)) = (parts.next(), parts.next(), parts.next()) {
            if let (Ok(a), Ok(b), Ok(c)) = (a.parse(), b.parse(), c.parse()) {
                return Some((a, b, c));
            }
        }
    }
    None
}

/// `curl` the npm registry for a package's latest version (curl ships with
/// Windows 10+, macOS, and virtually every Linux). None on any failure —
/// update checks are best-effort per CLI.
async fn fetch_latest(pkg: &str) -> Option<String> {
    let url = format!("https://registry.npmjs.org/{pkg}/latest");
    let mut cmd = Command::new("curl");
    cmd.args(["-fsSL", "--max-time", "15", &url])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd.output().await.ok()?;
    if !out.status.success() {
        return None;
    }
    let body: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    body["version"].as_str().map(String::from)
}

/// Compare every installed CLI against the npm registry. Only installed CLIs
/// with a registry feed appear in the result. Errors only when nothing could
/// be fetched at all (registry unreachable) so a manual check can say so.
#[tauri::command]
pub async fn check_cli_updates() -> AppResult<Vec<CliUpdateInfo>> {
    let clis = tauri::async_runtime::spawn_blocking(detect::detect_all)
        .await
        .map_err(|e| AppError::Other(format!("CLI detection failed: {e}")))?;

    let mut out = Vec::new();
    let mut attempted = 0usize;
    for info in clis {
        let (Some(pkg), Some(installed)) = (npm_package(info.kind), info.version.clone()) else {
            continue;
        };
        attempted += 1;
        let Some(latest) = fetch_latest(pkg).await else {
            continue;
        };
        let has_update = match (parse_semver(&installed), parse_semver(&latest)) {
            (Some(cur), Some(new)) => new > cur,
            _ => false,
        };
        out.push(CliUpdateInfo { kind: info.kind, installed, latest, has_update });
    }
    if attempted > 0 && out.is_empty() {
        return Err(AppError::Other(
            "couldn't reach the npm registry — check your connection and try again".into(),
        ));
    }
    Ok(out)
}

/// Re-run the vendor's official install command headless (it installs the
/// latest release), then re-detect the binary. Returns the refreshed info.
#[tauri::command]
pub async fn update_cli(cli: CliKind) -> AppResult<CliInfo> {
    let (program, args) = install::shell_invocation(cli).ok_or_else(|| {
        AppError::Other(format!("{} can't be updated on this OS", cli.label()))
    })?;
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let out = tokio::time::timeout(Duration::from_secs(600), cmd.output())
        .await
        .map_err(|_| AppError::Other(format!("{} update timed out", cli.label())))?
        .map_err(|e| AppError::Other(format!("failed to run the updater: {e}")))?;
    if !out.status.success() {
        // The last few stderr lines usually carry the actual reason.
        let stderr = String::from_utf8_lossy(&out.stderr);
        let mut lines: Vec<&str> = stderr.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
        let tail = lines.split_off(lines.len().saturating_sub(3)).join(" · ");
        return Err(AppError::Other(if tail.is_empty() {
            format!("{} update failed", cli.label())
        } else {
            tail
        }));
    }

    tauri::async_runtime::spawn_blocking(move || detect::detect(cli))
        .await
        .map_err(|e| AppError::Other(format!("re-detection failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_parses_from_raw_version_strings() {
        assert_eq!(parse_semver("2.1.173 (Claude Code)"), Some((2, 1, 173)));
        assert_eq!(parse_semver("codex-cli 0.139.0"), Some((0, 139, 0)));
        assert_eq!(parse_semver("v1.17.4"), Some((1, 17, 4)));
        assert_eq!(parse_semver("1.2"), None);
        assert_eq!(parse_semver("no digits here"), None);
        // The 4th component is ignored, not a parse failure.
        assert_eq!(parse_semver("1.2.3.4"), Some((1, 2, 3)));
    }

    #[test]
    fn newer_version_compares_by_numeric_tuple() {
        // 0.139.0 vs 0.139.0 — same → no update; tuple compare is numeric,
        // not lexicographic (0.9.0 < 0.10.0).
        assert!(parse_semver("0.10.0") > parse_semver("0.9.0"));
        assert_eq!(parse_semver("0.139.0"), parse_semver("codex-cli 0.139.0"));
        assert!(parse_semver("2.1.174") > parse_semver("2.1.173 (Claude Code)"));
    }

    #[test]
    fn every_cli_but_grok_has_a_registry_feed() {
        assert_eq!(npm_package(CliKind::Claude), Some("@anthropic-ai/claude-code"));
        assert_eq!(npm_package(CliKind::Codex), Some("@openai/codex"));
        assert_eq!(npm_package(CliKind::Gemini), Some("@google/gemini-cli"));
        assert_eq!(npm_package(CliKind::Opencode), Some("opencode-ai"));
        assert_eq!(npm_package(CliKind::Grok), None);
    }
}
