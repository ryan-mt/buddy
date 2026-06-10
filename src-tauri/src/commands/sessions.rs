//! Session history & transcript commands.

use crate::cli::projects_fs::{
    default_claude_dir, read_transcript as read_jsonl, scan_resumable, ResumableSession,
    TranscriptEntry,
};
use crate::db::SessionRecord;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> AppResult<Vec<SessionRecord>> {
    state.db.list_sessions()
}

/// Forget a single session in history and return the updated list.
#[tauri::command]
pub fn remove_session(state: State<'_, AppState>, id: String) -> AppResult<Vec<SessionRecord>> {
    state.db.remove_session(&id)?;
    state.db.list_sessions()
}

/// Forget every exited session and return the updated list.
#[tauri::command]
pub fn clear_sessions(state: State<'_, AppState>) -> AppResult<Vec<SessionRecord>> {
    state.db.clear_exited_sessions()?;
    state.db.list_sessions()
}

/// Claude sessions found on disk for a profile (or the default `~/.claude`),
/// offered for resume even if they were never started inside buddy.
#[tauri::command]
pub fn list_resumable(
    state: State<'_, AppState>,
    profile: Option<String>,
) -> AppResult<Vec<ResumableSession>> {
    let dir = config_dir(&state, profile.as_deref())?;
    Ok(scan_resumable(&dir))
}

/// Read a past Claude session's transcript (read-only viewer).
#[tauri::command]
pub fn read_transcript(state: State<'_, AppState>, id: String) -> AppResult<Vec<TranscriptEntry>> {
    let session = state
        .db
        .get_session(&id)?
        .ok_or_else(|| AppError::Other("session not found".into()))?;
    let dir = config_dir(&state, session.profile_id.as_deref())?;
    read_jsonl(&dir, session.cwd.as_deref(), &id)
}

/// Resolve the Claude config dir for a profile id, falling back to `~/.claude`.
fn config_dir(state: &State<'_, AppState>, profile: Option<&str>) -> AppResult<PathBuf> {
    if let Some(pid) = profile {
        if let Some(p) = state.db.get_profile(pid)? {
            return Ok(PathBuf::from(p.config_dir));
        }
    }
    default_claude_dir().ok_or_else(|| AppError::Other("no home directory".into()))
}
