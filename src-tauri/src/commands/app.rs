//! App-level commands.

use crate::cli::{detect, CliInfo};
use crate::error::{AppError, AppResult};
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

/// Open buddy's data folder (database, profile config dirs) in the OS file manager.
#[tauri::command]
pub fn reveal_data_dir() -> AppResult<()> {
    let dir = crate::data_dir();
    tauri_plugin_opener::open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| AppError::Other(format!("couldn't open data folder: {e}")))
}
