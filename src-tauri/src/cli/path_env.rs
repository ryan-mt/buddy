//! Make the process PATH match what the user's terminal sees.
//!
//! GUI launches on macOS (Finder/Dock) and some Linux desktops start with a
//! minimal PATH (`/usr/bin:/bin:…`) that misses nvm/Homebrew/npm-prefix dirs,
//! so `which`, `git`, `node` and the agent CLIs all look "not installed".
//! `bootstrap()` asks the user's login shell for its PATH and merges it into
//! this process before anything else runs; `well_known_bin_dirs()` is the
//! static fallback used both here and by CLI detection.

use std::path::PathBuf;

/// Directories where agent CLIs / node toolchains commonly land, per OS.
/// Only existing directories are returned.
pub fn well_known_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let home = directories::BaseDirs::new().map(|b| b.home_dir().to_path_buf());

    if cfg!(windows) {
        if let Some(home) = &home {
            dirs.push(home.join(".local").join("bin")); // native installers (claude, codex)
        }
        // npm's default global prefix: %APPDATA%\npm (claude.cmd, gemini.cmd, …).
        if let Some(base) = directories::BaseDirs::new() {
            dirs.push(base.config_dir().join("npm"));
        }
    } else {
        if let Some(home) = &home {
            dirs.push(home.join(".local").join("bin"));
            dirs.push(home.join(".volta").join("bin"));
            dirs.push(home.join(".bun").join("bin"));
            dirs.push(home.join(".npm-global").join("bin"));
            // pnpm's global bin: ~/Library/pnpm (macOS), ~/.local/share/pnpm (Linux).
            dirs.push(home.join("Library").join("pnpm"));
            dirs.push(home.join(".local").join("share").join("pnpm"));
            if let Some(nvm) = nvm_current_bin(home) {
                dirs.push(nvm);
            }
        }
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/home/linuxbrew/.linuxbrew/bin"));
    }

    dirs.retain(|d| d.is_dir());
    dirs
}

/// The highest-versioned `~/.nvm/versions/node/v*/bin` dir, if nvm is used.
fn nvm_current_bin(home: &std::path::Path) -> Option<PathBuf> {
    let versions = home.join(".nvm").join("versions").join("node");
    let mut best: Option<((u64, u64, u64), PathBuf)> = None;
    for entry in std::fs::read_dir(versions).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let mut parts = name.trim_start_matches('v').split('.');
        let (Some(Ok(a)), Some(Ok(b)), Some(Ok(c))) = (
            parts.next().map(str::parse::<u64>),
            parts.next().map(str::parse::<u64>),
            parts.next().map(str::parse::<u64>),
        ) else {
            continue;
        };
        let key = (a, b, c);
        if best.as_ref().is_none_or(|(k, _)| key > *k) {
            best = Some((key, entry.path().join("bin")));
        }
    }
    best.map(|(_, p)| p)
}

/// Merge PATH lists: every entry of `primary` first, then whatever `secondary`
/// adds, deduplicated while preserving order.
#[cfg(any(unix, test))]
fn merge_paths(primary: &str, secondary: &str, sep: char) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for entry in primary.split(sep).chain(secondary.split(sep)) {
        if !entry.is_empty() && seen.insert(entry.to_string()) {
            out.push(entry);
        }
    }
    out.join(&sep.to_string())
}

/// The PATH= line out of `env` output (last one wins).
#[cfg(any(unix, test))]
fn parse_env_path(output: &str) -> Option<String> {
    output
        .lines()
        .filter_map(|l| l.strip_prefix("PATH="))
        .next_back()
        .map(|s| s.trim().to_string())
}

/// Merge the user's login-shell PATH (plus the static well-known dirs) into
/// this process. Capped at a few seconds so a broken shell profile can't hang
/// startup; on any failure the static dirs still apply.
#[cfg(unix)]
pub fn bootstrap() {
    let shell_path = login_shell_path();
    let current = std::env::var("PATH").unwrap_or_default();
    let mut merged = match shell_path {
        Some(shell) => merge_paths(&shell, &current, ':'),
        None => current,
    };
    let extras = well_known_bin_dirs()
        .iter()
        .map(|d| d.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(":");
    if !extras.is_empty() {
        merged = merge_paths(&merged, &extras, ':');
    }
    std::env::set_var("PATH", merged);
}

/// Windows GUI apps inherit the full registry PATH already — nothing to do.
#[cfg(windows)]
pub fn bootstrap() {}

/// Run the user's shell as an interactive login shell and read PATH out of
/// `env` (a real binary, so fish/zsh list quirks can't change the format).
/// Interactive because nvm/pyenv install themselves in rc files, not profiles.
#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::time::Duration;

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string());
    // csh/tcsh reject combined `-ilc`; POSIX sh is everywhere as a fallback.
    let shell = if shell.ends_with("csh") {
        "/bin/sh".to_string()
    } else {
        shell
    };

    let mut child = Command::new(&shell)
        .args(["-ilc", "env"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        let _ = tx.send(buf);
    });

    let output = match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(out) => out,
        Err(_) => {
            let _ = child.kill(); // hung profile — give up, unblock the reader
            let _ = child.wait();
            return None;
        }
    };
    let _ = child.wait();
    parse_env_path(&output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_keeps_order_and_dedupes() {
        assert_eq!(merge_paths("/a:/b", "/b:/c", ':'), "/a:/b:/c");
        assert_eq!(merge_paths("", "/x:/x", ':'), "/x");
        assert_eq!(merge_paths("/a", "", ':'), "/a");
    }

    #[test]
    fn env_path_takes_the_last_path_line() {
        let out = "HOME=/u\nPATH=/first\nLANG=C\nPATH=/second:/bin\n";
        assert_eq!(parse_env_path(out).as_deref(), Some("/second:/bin"));
        assert_eq!(parse_env_path("HOME=/u\n"), None);
    }

    #[test]
    fn well_known_dirs_exist() {
        for dir in well_known_bin_dirs() {
            assert!(dir.is_dir(), "{dir:?} should exist");
        }
    }
}
