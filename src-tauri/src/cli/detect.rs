//! Locate agent CLI binaries and read their versions.

use crate::cli::{CliInfo, CliKind};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Detect every known CLI. Probes run in parallel — npm `.cmd` shims pay a
/// full node startup per `--version`, which adds up done serially.
pub fn detect_all() -> Vec<CliInfo> {
    let handles: Vec<_> = CliKind::ALL
        .iter()
        .map(|&kind| std::thread::spawn(move || detect(kind)))
        .collect();
    CliKind::ALL
        .iter()
        .zip(handles)
        .map(|(&kind, handle)| {
            handle.join().unwrap_or_else(|_| CliInfo {
                kind,
                label: kind.label().to_string(),
                available: false,
                path: None,
                version: None,
            })
        })
        .collect()
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

/// Find a CLI's binary without probing its version (cheap enough per call).
pub fn locate(kind: CliKind) -> Option<PathBuf> {
    if let Ok(path) = which::which(kind.binary()) {
        return Some(path);
    }
    candidate_paths(kind).into_iter().find(|p| p.is_file())
}

fn probe(path: &Path) -> Option<String> {
    let mut cmd = Command::new(path);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let output = cmd.output().ok()?;
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

/// Fallback locations when PATH lookup misses: every well-known bin dir,
/// with each platform-plausible binary name (npm installs land as `.cmd`
/// shims on Windows, native installers as `.exe`).
fn candidate_paths(kind: CliKind) -> Vec<PathBuf> {
    let names: &[String] = &if cfg!(windows) {
        vec![
            format!("{}.exe", kind.binary()),
            format!("{}.cmd", kind.binary()),
        ]
    } else {
        vec![kind.binary().to_string()]
    };
    crate::cli::path_env::well_known_bin_dirs()
        .iter()
        .flat_map(|dir| names.iter().map(move |n| dir.join(n)))
        .collect()
}
