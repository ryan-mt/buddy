//! Locate agent CLI binaries and read their versions.

use crate::cli::{CliInfo, CliKind};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Detect every known CLI.
pub fn detect_all() -> Vec<CliInfo> {
    CliKind::ALL.iter().map(|&kind| detect(kind)).collect()
}

/// Detect a single CLI by kind, reading its version if found.
pub fn detect(kind: CliKind) -> CliInfo {
    let found = locate(kind).and_then(|path| probe(&path).map(|version| (path, version)));
    match found {
        Some((path, version)) => CliInfo {
            kind,
            label: kind.label().to_string(),
            available: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: Some(version),
        },
        None => CliInfo {
            kind,
            label: kind.label().to_string(),
            available: false,
            path: None,
            version: None,
        },
    }
}

fn locate(kind: CliKind) -> Option<PathBuf> {
    if let Ok(path) = which::which(kind.binary()) {
        return Some(path);
    }
    candidate_paths(kind).into_iter().find(|p| p.is_file())
}

fn probe(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

fn candidate_paths(kind: CliKind) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let exe = if cfg!(windows) {
        format!("{}.exe", kind.binary())
    } else {
        kind.binary().to_string()
    };

    if let Some(base) = directories::BaseDirs::new() {
        out.push(base.home_dir().join(".local").join("bin").join(&exe));
    }

    #[cfg(not(windows))]
    {
        out.push(PathBuf::from(format!("/usr/local/bin/{}", kind.binary())));
        out.push(PathBuf::from(format!(
            "/opt/homebrew/bin/{}",
            kind.binary()
        )));
    }

    out
}
