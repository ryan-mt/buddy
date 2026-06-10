//! Project list persistence commands.

use crate::db::Project;
use crate::error::AppResult;
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
