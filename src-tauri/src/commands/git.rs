//! Read-only git inspection backing the diff viewer: working-tree changes
//! (status + per-file line counts) and structured side-by-side rows parsed
//! from `git diff`. Everything shells out to the user's own `git` — buddy
//! never writes to the repository (`--no-optional-locks` keeps even status
//! from touching the index).

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

/// Untracked/new files are line-counted straight from disk, up to this size.
const COUNT_CAP_BYTES: u64 = 1024 * 1024;
/// A single file's diff stops growing past this many rows (UI shows a notice).
const MAX_ROWS: usize = 20_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    /// "modified" | "added" | "deleted" | "untracked" | "conflicted"
    pub status: String,
    /// Lines added/removed; None when unknown (binary or too large to count).
    pub added: Option<u64>,
    pub removed: Option<u64>,
    pub binary: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChanges {
    pub branch: String,
    pub files: Vec<GitChange>,
    pub added: u64,
    pub removed: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RowKind {
    Context,
    Add,
    Del,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRow {
    pub kind: RowKind,
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    pub text: String,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub rows: Vec<DiffRow>,
    pub binary: bool,
    pub truncated: bool,
}

/// Run git against `root` and return stdout, with readable errors for the
/// common failures (git missing, not a repository).
async fn git(root: &Path, args: &[&str]) -> AppResult<Vec<u8>> {
    let mut cmd = Command::new("git");
    cmd.arg("--no-optional-locks")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let out = cmd.output().await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::Other("git not found — install Git and make sure it is on PATH".into())
        } else {
            AppError::Other(format!("failed to run git: {e}"))
        }
    })?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let line = stderr
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("git failed")
            .trim();
        if line.contains("not a git repository") {
            return Err(AppError::Other("not a git repository".into()));
        }
        return Err(AppError::Other(line.to_string()));
    }
    Ok(out.stdout)
}

fn check_root(root: &str) -> AppResult<&Path> {
    let p = Path::new(root);
    if !p.is_absolute() || !p.is_dir() {
        return Err(AppError::Other(format!("folder no longer exists: {root}")));
    }
    Ok(p)
}

/// A repo-relative path as git status reports them: plain components only.
/// Anything absolute or with `..` could escape the repository when joined.
fn is_repo_relative(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
}

/// Whether the repo has any commit yet (`git diff HEAD` needs one).
async fn has_head(root: &Path) -> bool {
    git(root, &["rev-parse", "--verify", "--quiet", "HEAD"])
        .await
        .is_ok()
}

/// The working tree's changes versus HEAD, plus untracked files.
#[tauri::command]
pub async fn git_changes(root: String) -> AppResult<GitChanges> {
    let root = check_root(&root)?.to_path_buf();

    // --no-renames keeps every record a plain `XY path` (renames would add a
    // second NUL-separated origin path); -z gives raw, unquoted paths.
    let status_out = git(
        &root,
        &[
            "status",
            "--porcelain=v1",
            "-b",
            "-z",
            "--no-renames",
            "--untracked-files=all",
        ],
    )
    .await?;
    let (branch, entries) = parse_status(&status_out);

    let numstat = if has_head(&root).await {
        let out = git(
            &root,
            &[
                "diff",
                "HEAD",
                "--numstat",
                "-z",
                "--no-renames",
                "--no-ext-diff",
            ],
        )
        .await?;
        parse_numstat(&out)
    } else {
        HashMap::new()
    };

    let mut files = Vec::with_capacity(entries.len());
    let (mut total_added, mut total_removed) = (0u64, 0u64);
    for (xy, path) in entries {
        let status = classify(&xy);
        let (added, removed, binary) = match numstat.get(&path) {
            Some(&Numstat::Counts(a, r)) => (Some(a), Some(r), false),
            Some(&Numstat::Binary) => (None, None, true),
            // Untracked files (and everything in a repo with no commits yet)
            // never appear in `diff HEAD` — count their lines from disk.
            None if status != "deleted" => {
                let (lines, binary) = count_file_lines(&root.join(&path));
                (lines, Some(0), binary)
            }
            None => (None, None, false),
        };
        total_added += added.unwrap_or(0);
        total_removed += removed.unwrap_or(0);
        files.push(GitChange {
            path,
            status: status.to_string(),
            added,
            removed,
            binary,
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(GitChanges {
        branch,
        files,
        added: total_added,
        removed: total_removed,
    })
}

/// One file's diff as render-ready rows. `untracked` files (or any file in a
/// repo with no commits yet) are read from disk as pure additions.
#[tauri::command]
pub async fn git_file_diff(root: String, path: String, untracked: bool) -> AppResult<FileDiff> {
    let root = check_root(&root)?.to_path_buf();
    if !is_repo_relative(&path) {
        return Err(AppError::Other(format!("not a repository path: {path}")));
    }

    if untracked || !has_head(&root).await {
        return Ok(disk_as_added(&root.join(&path)));
    }
    let out = git(
        &root,
        &[
            "diff",
            "HEAD",
            "--no-color",
            "--no-renames",
            "--no-ext-diff",
            "-U1000000", // full context: the viewer collapses it client-side
            "--",
            &path,
        ],
    )
    .await?;
    Ok(parse_unified(&String::from_utf8_lossy(&out)))
}

// --- parsing (pure, unit-tested) ----------------------------------------------

/// Branch + `(XY, path)` entries out of `status --porcelain=v1 -b -z`.
fn parse_status(out: &[u8]) -> (String, Vec<(String, String)>) {
    let text = String::from_utf8_lossy(out);
    let mut branch = String::from("(unknown)");
    let mut entries = Vec::new();
    for record in text.split('\0') {
        if record.is_empty() {
            continue;
        }
        if let Some(rest) = record.strip_prefix("## ") {
            branch = parse_branch(rest);
            continue;
        }
        if record.len() < 4 || !record.is_char_boundary(2) || !record.is_char_boundary(3) {
            continue; // malformed — XY + space + path is at least 4 bytes
        }
        let (xy, path) = record.split_at(2);
        entries.push((xy.to_string(), path[1..].to_string()));
    }
    (branch, entries)
}

fn parse_branch(rest: &str) -> String {
    if let Some(name) = rest.strip_prefix("No commits yet on ") {
        return name.trim().to_string();
    }
    if rest.starts_with("HEAD (no branch)") {
        return "detached HEAD".into();
    }
    rest.split("...").next().unwrap_or(rest).trim().to_string()
}

fn classify(xy: &str) -> &'static str {
    let mut chars = xy.chars();
    let (x, y) = (chars.next().unwrap_or(' '), chars.next().unwrap_or(' '));
    if xy == "??" {
        "untracked"
    } else if x == 'U' || y == 'U' || xy == "AA" || xy == "DD" {
        "conflicted"
    } else if x == 'A' || y == 'A' {
        "added"
    } else if x == 'D' || y == 'D' {
        "deleted"
    } else {
        "modified"
    }
}

enum Numstat {
    Counts(u64, u64),
    Binary,
}

/// `added\tremoved\tpath` records out of `diff --numstat -z`.
fn parse_numstat(out: &[u8]) -> HashMap<String, Numstat> {
    let text = String::from_utf8_lossy(out);
    let mut map = HashMap::new();
    for record in text.split('\0') {
        let mut parts = record.splitn(3, '\t');
        let (Some(a), Some(r), Some(path)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let stat = match (a.parse::<u64>(), r.parse::<u64>()) {
            (Ok(a), Ok(r)) => Numstat::Counts(a, r),
            _ => Numstat::Binary, // "-\t-" for binary files
        };
        map.insert(path.to_string(), stat);
    }
    map
}

/// Unified diff (full context) → numbered rows. Tolerates multiple hunks and
/// skips `\ No newline at end of file` markers.
fn parse_unified(text: &str) -> FileDiff {
    let mut diff = FileDiff::default();
    let (mut old_no, mut new_no) = (0u32, 0u32);
    let mut in_hunk = false;
    for line in text.split('\n') {
        if line.starts_with("Binary files ") && line.ends_with(" differ") {
            diff.binary = true;
            return diff;
        }
        if let Some(header) = line.strip_prefix("@@ ") {
            (old_no, new_no) = parse_hunk_header(header);
            in_hunk = true;
            continue;
        }
        if !in_hunk {
            continue; // diff --git / index / ---/+++ headers
        }
        if diff.rows.len() >= MAX_ROWS {
            diff.truncated = true;
            return diff;
        }
        let mut chars = line.chars();
        let marker = chars.next();
        let text = chars.as_str().strip_suffix('\r').unwrap_or(chars.as_str());
        match marker {
            Some(' ') => {
                diff.rows.push(DiffRow {
                    kind: RowKind::Context,
                    old_no: Some(old_no),
                    new_no: Some(new_no),
                    text: text.to_string(),
                });
                old_no += 1;
                new_no += 1;
            }
            Some('-') => {
                diff.rows.push(DiffRow {
                    kind: RowKind::Del,
                    old_no: Some(old_no),
                    new_no: None,
                    text: text.to_string(),
                });
                old_no += 1;
            }
            Some('+') => {
                diff.rows.push(DiffRow {
                    kind: RowKind::Add,
                    old_no: None,
                    new_no: Some(new_no),
                    text: text.to_string(),
                });
                new_no += 1;
            }
            // `\ No newline at end of file`, or the empty tail after the
            // final newline — both carry no content.
            _ => {}
        }
    }
    diff
}

/// `-l[,n] +l[,n] @@ …` → starting line numbers (0 when a side is empty).
fn parse_hunk_header(header: &str) -> (u32, u32) {
    let mut old = 1u32;
    let mut new = 1u32;
    for part in header.split(' ') {
        let mut chars = part.chars();
        let sign = chars.next();
        let rest = chars.as_str();
        let start: u32 = rest
            .split(',')
            .next()
            .and_then(|n| n.parse().ok())
            .unwrap_or(1);
        match sign {
            Some('-') => old = start.max(1),
            Some('+') => new = start.max(1),
            _ => break, // "@@" — trailing context, stop
        }
    }
    (old, new)
}

/// A file that exists only on disk (untracked / repo without commits): every
/// line is an addition.
fn disk_as_added(path: &Path) -> FileDiff {
    let Ok(bytes) = std::fs::read(path) else {
        return FileDiff::default();
    };
    if bytes[..bytes.len().min(8192)].contains(&0) {
        return FileDiff {
            binary: true,
            ..FileDiff::default()
        };
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut diff = FileDiff::default();
    let total = text.split('\n').count();
    for (i, line) in text.split('\n').enumerate() {
        if i + 1 == total && line.is_empty() {
            break; // trailing newline, not an extra empty line
        }
        if diff.rows.len() >= MAX_ROWS {
            diff.truncated = true;
            break;
        }
        diff.rows.push(DiffRow {
            kind: RowKind::Add,
            old_no: None,
            new_no: Some(i as u32 + 1),
            text: line.strip_suffix('\r').unwrap_or(line).to_string(),
        });
    }
    diff
}

/// Lines in a disk file (None when bigger than the cap), plus a binary sniff.
fn count_file_lines(path: &Path) -> (Option<u64>, bool) {
    let Ok(meta) = std::fs::metadata(path) else {
        return (None, false);
    };
    if meta.len() > COUNT_CAP_BYTES {
        return (None, false);
    }
    let Ok(bytes) = std::fs::read(path) else {
        return (None, false);
    };
    if bytes[..bytes.len().min(8192)].contains(&0) {
        return (None, true);
    }
    if bytes.is_empty() {
        return (Some(0), false);
    }
    let newlines = bytes.iter().filter(|&&b| b == b'\n').count() as u64;
    let lines = if bytes.ends_with(b"\n") {
        newlines
    } else {
        newlines + 1
    };
    (Some(lines), false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_parses_branch_and_entries() {
        let out =
            b"## master...origin/master [ahead 1]\0 M src/a.rs\0?? new file.txt\0A  added.rs\0"
                .to_vec();
        let (branch, entries) = parse_status(&out);
        assert_eq!(branch, "master");
        assert_eq!(
            entries,
            vec![
                (" M".into(), "src/a.rs".into()),
                ("??".into(), "new file.txt".into()),
                ("A ".into(), "added.rs".into()),
            ]
        );
    }

    #[test]
    fn status_branch_edge_cases() {
        assert_eq!(parse_status(b"## No commits yet on main\0").0, "main");
        assert_eq!(parse_status(b"## HEAD (no branch)\0").0, "detached HEAD");
        assert_eq!(parse_status(b"## feature/x\0").0, "feature/x");
    }

    #[test]
    fn repo_relative_rejects_escapes() {
        assert!(is_repo_relative("src/main.rs"));
        assert!(is_repo_relative("a b/c-d.txt"));
        assert!(!is_repo_relative(""));
        assert!(!is_repo_relative("../outside.txt"));
        assert!(!is_repo_relative("src/../../outside.txt"));
        assert!(!is_repo_relative("C:\\Windows\\system.ini"));
        assert!(!is_repo_relative("/etc/passwd"));
        assert!(!is_repo_relative("\\\\server\\share\\x"));
    }

    #[test]
    fn classify_covers_the_grid() {
        assert_eq!(classify("??"), "untracked");
        assert_eq!(classify("UU"), "conflicted");
        assert_eq!(classify("AA"), "conflicted");
        assert_eq!(classify("DD"), "conflicted");
        assert_eq!(classify("A "), "added");
        assert_eq!(classify("AM"), "added");
        assert_eq!(classify(" D"), "deleted");
        assert_eq!(classify("D "), "deleted");
        assert_eq!(classify(" M"), "modified");
        assert_eq!(classify("MM"), "modified");
    }

    #[test]
    fn numstat_parses_counts_and_binary() {
        let out = b"12\t3\tsrc/a.rs\0-\t-\timg.png\0".to_vec();
        let map = parse_numstat(&out);
        assert!(matches!(map.get("src/a.rs"), Some(Numstat::Counts(12, 3))));
        assert!(matches!(map.get("img.png"), Some(Numstat::Binary)));
    }

    #[test]
    fn unified_diff_yields_numbered_rows() {
        let text = "diff --git a/f b/f\nindex 000..111 100644\n--- a/f\n+++ b/f\n@@ -1,4 +1,4 @@\n one\n-two\n+TWO\n three\n\\ No newline at end of file\n";
        let diff = parse_unified(text);
        assert!(!diff.binary && !diff.truncated);
        let rows: Vec<_> = diff
            .rows
            .iter()
            .map(|r| (r.kind, r.old_no, r.new_no, r.text.as_str()))
            .collect();
        assert_eq!(
            rows,
            vec![
                (RowKind::Context, Some(1), Some(1), "one"),
                (RowKind::Del, Some(2), None, "two"),
                (RowKind::Add, None, Some(2), "TWO"),
                (RowKind::Context, Some(3), Some(3), "three"),
            ]
        );
    }

    #[test]
    fn unified_diff_detects_binary_and_crlf() {
        assert!(parse_unified("Binary files a/x and b/x differ\n").binary);
        let diff = parse_unified("@@ -1 +1 @@\n-a\r\n+b\r\n");
        assert_eq!(diff.rows[0].text, "a");
        assert_eq!(diff.rows[1].text, "b");
    }

    #[test]
    fn hunk_header_without_counts() {
        assert_eq!(parse_hunk_header("-1 +1 @@"), (1, 1));
        assert_eq!(parse_hunk_header("-10,4 +20,6 @@ fn main()"), (10, 20));
        // New files: the old side is "-0,0".
        assert_eq!(parse_hunk_header("-0,0 +1,5 @@"), (1, 1));
    }

    #[test]
    fn count_lines_handles_trailing_newline() {
        let dir = std::env::temp_dir().join("buddy-git-test");
        let _ = std::fs::create_dir_all(&dir);
        let file = dir.join("count.txt");
        std::fs::write(&file, "a\nb\nc\n").unwrap();
        assert_eq!(count_file_lines(&file), (Some(3), false));
        std::fs::write(&file, "a\nb\nc").unwrap();
        assert_eq!(count_file_lines(&file), (Some(3), false));
        std::fs::write(&file, "").unwrap();
        assert_eq!(count_file_lines(&file), (Some(0), false));
        let _ = std::fs::remove_file(&file);
    }
}
