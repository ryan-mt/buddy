//! App-level commands.

use crate::cli::{detect, CliInfo};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::State;

/// Detect the supported agent CLIs and cache the result in app state.
/// Async + spawn_blocking: probing five `--version`s would otherwise run on
/// the main thread and freeze the UI at startup.
#[tauri::command]
pub async fn list_clis(state: State<'_, AppState>) -> AppResult<Vec<CliInfo>> {
    let clis = tauri::async_runtime::spawn_blocking(detect::detect_all)
        .await
        .map_err(|e| AppError::Other(format!("CLI detection failed: {e}")))?;
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
