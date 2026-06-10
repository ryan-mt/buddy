//! Profile (isolated CLI configuration) persistence commands.

use crate::db::Profile;
use crate::error::AppResult;
use crate::state::AppState;
use tauri::State;

/// Editable fields of a profile (wrapped so command args stay single-word).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub name: String,
    pub color: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

#[tauri::command]
pub fn list_profiles(state: State<'_, AppState>) -> AppResult<Vec<Profile>> {
    state.db.list_profiles()
}

#[tauri::command]
pub fn add_profile(state: State<'_, AppState>, input: ProfileInput) -> AppResult<Vec<Profile>> {
    state.db.add_profile(
        input.name.trim(),
        &input.color,
        input.model.as_deref(),
        input.base_url.as_deref(),
    )?;
    state.db.list_profiles()
}

#[tauri::command]
pub fn update_profile(
    state: State<'_, AppState>,
    id: String,
    input: ProfileInput,
) -> AppResult<Vec<Profile>> {
    state.db.update_profile(
        &id,
        input.name.trim(),
        &input.color,
        input.model.as_deref(),
        input.base_url.as_deref(),
    )?;
    state.db.list_profiles()
}

#[tauri::command]
pub fn remove_profile(state: State<'_, AppState>, id: String) -> AppResult<Vec<Profile>> {
    state.db.remove_profile(&id)?;
    state.db.list_profiles()
}
