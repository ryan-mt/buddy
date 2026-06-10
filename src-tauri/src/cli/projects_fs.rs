//! Reading Claude Code's on-disk session transcripts.
//!
//! Claude stores each session as JSON-lines at
//! `<config>/projects/<encoded-cwd>/<session-id>.jsonl`, where the cwd is
//! encoded by replacing `:` `\` `/` with `-`. To avoid depending on that
//! reconstruction we also fall back to scanning every project dir for the id,
//! and we read the real `cwd` out of the file rather than decoding the folder.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

/// Default Claude config dir when a session isn't bound to a profile (`~/.claude`).
pub fn default_claude_dir() -> Option<PathBuf> {
    directories::BaseDirs::new().map(|b| b.home_dir().join(".claude"))
}

/// Encode an absolute cwd the way Claude names its per-project transcript dir.
fn encode_cwd(cwd: &str) -> String {
    cwd.chars()
        .map(|c| {
            if c == ':' || c == '\\' || c == '/' {
                '-'
            } else {
                c
            }
        })
        .collect()
}

/// One past session discovered on disk, offered for resume.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumableSession {
    pub id: String,
    pub cwd: Option<String>,
    /// Last-modified time (unix seconds) for sorting newest-first.
    pub modified: i64,
    /// First user prompt, trimmed — a human-readable hint of what the session was.
    pub preview: Option<String>,
}

/// A flattened transcript line for the read-only viewer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEntry {
    /// user | assistant | system | summary
    pub role: String,
    pub text: String,
    pub timestamp: Option<String>,
    /// Output tokens reported on an assistant turn, when present.
    pub tokens: Option<u64>,
}

/// Locate a session's `.jsonl`: try the encoded-cwd path first, then search.
fn locate(config_dir: &Path, cwd: Option<&str>, id: &str) -> Option<PathBuf> {
    let projects = config_dir.join("projects");
    if let Some(cwd) = cwd {
        let direct = projects.join(encode_cwd(cwd)).join(format!("{id}.jsonl"));
        if direct.is_file() {
            return Some(direct);
        }
    }
    let file = format!("{id}.jsonl");
    let dirs = fs::read_dir(&projects).ok()?;
    for entry in dirs.flatten() {
        let candidate = entry.path().join(&file);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Read and flatten a transcript. Lines that fail to parse are skipped so a
/// single malformed entry never breaks the whole view.
pub fn read_transcript(
    config_dir: &Path,
    cwd: Option<&str>,
    id: &str,
) -> AppResult<Vec<TranscriptEntry>> {
    let path = locate(config_dir, cwd, id)
        .ok_or_else(|| AppError::Other("transcript not found".into()))?;
    let file = fs::File::open(&path)?;
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for line in reader.lines() {
        let Ok(line) = line else { continue };
        if line.trim().is_empty() {
            continue;
        }
        if let Some(entry) = parse_entry(&line) {
            out.push(entry);
        }
    }
    Ok(out)
}

/// Best-effort flatten of one JSONL record into a viewer entry.
fn parse_entry(line: &str) -> Option<TranscriptEntry> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");

    if kind == "summary" {
        let text = v.get("summary").and_then(|s| s.as_str()).unwrap_or("");
        return Some(TranscriptEntry {
            role: "summary".into(),
            text: text.to_string(),
            timestamp: None,
            tokens: None,
        });
    }

    // user / assistant / system carry a nested `message`.
    let message = v.get("message")?;
    let role = message
        .get("role")
        .and_then(|r| r.as_str())
        .unwrap_or(kind)
        .to_string();
    let text = flatten_content(message.get("content"));
    if text.is_empty() {
        return None;
    }
    let timestamp = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());
    let tokens = message
        .get("usage")
        .and_then(|u| u.get("output_tokens"))
        .and_then(|t| t.as_u64());
    Some(TranscriptEntry {
        role,
        text,
        timestamp,
        tokens,
    })
}

/// Claude `content` is either a string or an array of typed blocks.
fn flatten_content(content: Option<&serde_json::Value>) -> String {
    match content {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(blocks)) => {
            let mut parts = Vec::new();
            for b in blocks {
                match b.get("type").and_then(|t| t.as_str()) {
                    Some("text") => {
                        if let Some(t) = b.get("text").and_then(|t| t.as_str()) {
                            parts.push(t.to_string());
                        }
                    }
                    Some("tool_use") => {
                        let name = b.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                        parts.push(format!("[→ {name}]"));
                    }
                    Some("tool_result") => parts.push("[tool result]".to_string()),
                    Some("thinking") => parts.push("[thinking]".to_string()),
                    _ => {}
                }
            }
            parts.join("\n")
        }
        _ => String::new(),
    }
}

/// Scan a config dir for resumable Claude sessions (newest first, capped).
pub fn scan_resumable(config_dir: &Path) -> Vec<ResumableSession> {
    let projects = config_dir.join("projects");
    let Ok(dirs) = fs::read_dir(&projects) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for dir in dirs.flatten() {
        let Ok(files) = fs::read_dir(dir.path()) else {
            continue;
        };
        for file in files.flatten() {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let modified = path
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let (cwd, preview) = peek(&path);
            out.push(ResumableSession {
                id: id.to_string(),
                cwd,
                modified,
                preview,
            });
        }
    }
    out.sort_by_key(|s| std::cmp::Reverse(s.modified));
    out.truncate(200);
    out
}

/// Read a transcript's cwd and first user prompt without loading the whole file.
fn peek(path: &Path) -> (Option<String>, Option<String>) {
    let Ok(file) = fs::File::open(path) else {
        return (None, None);
    };
    let mut cwd = None;
    let mut preview = None;
    for line in BufReader::new(file).lines().take(40) {
        let Ok(line) = line else { break };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if cwd.is_none() {
            cwd = v.get("cwd").and_then(|c| c.as_str()).map(|s| s.to_string());
        }
        if preview.is_none() && v.get("type").and_then(|t| t.as_str()) == Some("user") {
            let text = flatten_content(v.get("message").and_then(|m| m.get("content")));
            let text = text.trim();
            if !text.is_empty() && !text.starts_with('<') {
                preview = Some(text.chars().take(120).collect());
            }
        }
        if cwd.is_some() && preview.is_some() {
            break;
        }
    }
    (cwd, preview)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_windows_path_like_claude() {
        assert_eq!(
            encode_cwd(r"C:\Users\nguye\projects\buddy"),
            "C--Users-nguye-projects-buddy"
        );
    }

    #[test]
    fn flattens_string_and_block_content() {
        let s = serde_json::json!({ "content": "hi" });
        assert_eq!(flatten_content(s.get("content")), "hi");
        let blocks = serde_json::json!({
            "content": [
                { "type": "text", "text": "a" },
                { "type": "tool_use", "name": "Read" }
            ]
        });
        assert_eq!(flatten_content(blocks.get("content")), "a\n[→ Read]");
    }

    #[test]
    fn parses_user_and_summary_lines() {
        let user = r#"{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"t"}"#;
        let e = parse_entry(user).unwrap();
        assert_eq!(e.role, "user");
        assert_eq!(e.text, "hello");
        assert_eq!(e.timestamp.as_deref(), Some("t"));

        let summary = r#"{"type":"summary","summary":"did things"}"#;
        let s = parse_entry(summary).unwrap();
        assert_eq!(s.role, "summary");
        assert_eq!(s.text, "did things");
    }

    #[test]
    fn captures_assistant_tokens() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}],"usage":{"output_tokens":42}}}"#;
        let e = parse_entry(line).unwrap();
        assert_eq!(e.role, "assistant");
        assert_eq!(e.tokens, Some(42));
    }
}
