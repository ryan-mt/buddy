//! App-level commands.

use crate::cli::{detect, CliInfo};
use crate::error::AppResult;
use crate::state::AppState;
use tauri::State;

/// Detect the supported agent CLIs and cache the result in app state.
#[tauri::command]
pub fn list_clis(state: State<'_, AppState>) -> AppResult<Vec<CliInfo>> {
    let clis = detect::detect_all();
    if let Ok(mut slot) = state.clis.lock() {
        *slot = clis.clone();
    }
    Ok(clis)
}
