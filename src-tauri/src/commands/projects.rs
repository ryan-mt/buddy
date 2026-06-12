//! Project list persistence commands.

use crate::db::Project;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    state.db.list_projects()
}

/// Add a project folder and return the updated list.
#[tauri::command]
pub fn add_project(state: State<'_, AppState>, path: String) -> AppResult<Vec<Project>> {
    state.db.add_project(&path)?;
    state.db.list_projects()
}

/// Remove a project by id and return the updated list.
#[tauri::command]
pub fn remove_project(state: State<'_, AppState>, id: String) -> AppResult<Vec<Project>> {
    state.db.remove_project(&id)?;
    state.db.list_projects()
}

/// Open the OS file manager at `path` (folders open directly, files are
/// revealed selected). Guarded so a stale project can't error confusingly.
#[tauri::command]
pub fn reveal_path(path: String) -> AppResult<()> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(AppError::Other(format!("folder no longer exists: {path}")));
    }
    if p.is_dir() {
        tauri_plugin_opener::open_path(&path, None::<&str>)
            .map_err(|e| AppError::Other(format!("couldn't open folder: {e}")))
    } else {
        tauri_plugin_opener::reveal_item_in_dir(p)
            .map_err(|e| AppError::Other(format!("couldn't reveal file: {e}")))
    }
}
