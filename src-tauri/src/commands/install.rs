//! Commands for installing agent CLIs from within the app.

use crate::cli::install::{self, InstallSpec};
use crate::cli::CliKind;
use crate::error::{AppError, AppResult};
use crate::pty::{SpawnSpec, TerminalMsg};
use crate::state::AppState;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use uuid::Uuid;

/// Install command + prerequisites for every CLI on this OS.
#[tauri::command]
pub fn install_specs() -> Vec<InstallSpec> {
    install::install_specs()
}

/// Whether Node.js / npm are on PATH (some installs need them), plus a per-OS
/// hint on how to get them.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatus {
    pub node: bool,
    pub npm: bool,
    pub hint: String,
}

#[tauri::command]
pub fn node_status() -> NodeStatus {
    let hint = match std::env::consts::OS {
        "windows" => "Install Node.js: winget install OpenJS.NodeJS  (or nodejs.org)",
        "macos" => "Install Node.js: brew install node  (or nodejs.org)",
        _ => "Install Node.js with your package manager (e.g. apt install nodejs npm) or from nodejs.org",
    }
    .to_string();
    NodeStatus {
        node: which::which("node").is_ok(),
        npm: which::which("npm").is_ok(),
        hint,
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOpts {
    pub cli: CliKind,
    pub rows: u16,
    pub cols: u16,
}

/// Run a CLI's install command in a PTY, streaming output. Returns the session
/// id so the frontend can drive/resize/kill it like any other terminal.
#[tauri::command]
pub fn install_cli(
    state: State<'_, AppState>,
    opts: InstallOpts,
    channel: Channel<TerminalMsg>,
) -> AppResult<String> {
    let (program, args) = install::shell_invocation(opts.cli)
        .ok_or_else(|| AppError::Other("install not supported on this OS".into()))?;

    let id = Uuid::new_v4();
    let cwd = directories::BaseDirs::new().map(|b| b.home_dir().to_string_lossy().into_owned());
    let spec = SpawnSpec {
        program,
        args,
        cwd,
        env: vec![],
        rows: opts.rows,
        cols: opts.cols,
    };

    state
        .sessions
        .start(id, spec, move |msg| channel.send(msg).is_ok())?;
    Ok(id.to_string())
}
