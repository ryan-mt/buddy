//! Commands that drive interactive PTY terminal sessions.

use crate::cli::{env::profile_env, session_args, CliKind};
use crate::db::NewSession;
use crate::error::{AppError, AppResult};
use crate::pty::{SpawnSpec, TerminalMsg};
use crate::state::AppState;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTerminalOpts {
    pub cli: CliKind,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub effort: Option<String>,
    /// Bind the session to a profile (isolated config dir + env overrides).
    pub profile_id: Option<String>,
    /// Display title persisted to history (falls back to the folder / CLI name).
    pub title: Option<String>,
    /// When set, reopen this prior session id instead of minting a new one
    /// (Claude `--resume <id>`).
    pub resume_id: Option<String>,
    pub rows: u16,
    pub cols: u16,
}

/// Start (or resume) an interactive CLI session in a PTY. Returns the session id
/// (also passed to Claude as `--session-id` / `--resume` so it can be reopened).
#[tauri::command]
pub fn start_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    opts: StartTerminalOpts,
    channel: Channel<TerminalMsg>,
) -> AppResult<String> {
    let program = {
        let clis = state
            .clis
            .lock()
            .map_err(|_| AppError::Other("cli state poisoned".into()))?;
        clis.iter()
            .find(|c| c.kind == opts.cli && c.available)
            .and_then(|c| c.path.clone())
            .ok_or(AppError::CliNotFound(opts.cli))?
    };

    let (id, resume) = match opts.resume_id.as_deref() {
        Some(s) => (
            Uuid::parse_str(s).map_err(|_| AppError::Other("invalid session id".into()))?,
            true,
        ),
        None => (Uuid::new_v4(), false),
    };

    let env = match opts.profile_id.as_deref() {
        Some(pid) => {
            let profile = state
                .db
                .get_profile(pid)?
                .ok_or_else(|| AppError::Other("profile not found".into()))?;
            profile_env(opts.cli, &profile)
        }
        None => vec![],
    };

    let args = session_args(
        opts.cli,
        id,
        opts.model.as_deref(),
        opts.permission_mode.as_deref(),
        opts.effort.as_deref(),
        resume,
    );
    let cwd = opts.cwd.clone().or_else(|| {
        directories::BaseDirs::new().map(|b| b.home_dir().to_string_lossy().into_owned())
    });

    let spec = SpawnSpec {
        program,
        args,
        cwd: cwd.clone(),
        env,
        rows: opts.rows,
        cols: opts.cols,
    };

    let id_str = id.to_string();
    let title = opts
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .or_else(|| cwd.as_deref().map(basename))
        .unwrap_or_else(|| opts.cli.label().to_string());

    // Record the session before spawning so an instant-exit callback always has
    // a row to flip to "exited"; a failed spawn is marked exited right after.
    state.db.persist_session(&NewSession {
        id: id_str.clone(),
        cli: opts.cli.as_str().to_string(),
        title,
        cwd,
        profile_id: opts.profile_id.clone(),
        model: opts.model.clone(),
        permission_mode: opts.permission_mode.clone(),
        effort: opts.effort.clone(),
    })?;

    let exit_app = app.clone();
    let exit_id = id_str.clone();
    let started = state.sessions.start(id, spec, move |msg| {
        if let TerminalMsg::Exit { code } = &msg {
            let _ = exit_app
                .state::<AppState>()
                .db
                .mark_session_exited(&exit_id, *code);
        }
        channel.send(msg).is_ok()
    });

    if started.is_err() {
        let _ = state.db.mark_session_exited(&id_str, None);
    }
    started?;
    Ok(id_str)
}

/// Last path component of `path` (handles both `/` and `\` separators).
fn basename(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .find(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

#[tauri::command]
pub fn write_terminal(state: State<'_, AppState>, id: String, data: String) -> AppResult<()> {
    state.sessions.write(parse_id(&id)?, data.as_bytes())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    id: String,
    rows: u16,
    cols: u16,
) -> AppResult<()> {
    state.sessions.resize(parse_id(&id)?, rows, cols)
}

#[tauri::command]
pub fn kill_terminal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.sessions.kill(parse_id(&id)?)
}

fn parse_id(id: &str) -> AppResult<Uuid> {
    Uuid::parse_str(id).map_err(|_| AppError::Other("invalid session id".into()))
}
