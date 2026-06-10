mod cli;
mod commands;
mod db;
mod error;
mod pty;
mod state;

use state::AppState;
use std::sync::Mutex;

/// Resolve the on-disk database path under the OS data dir, creating the folder.
fn database_path() -> std::path::PathBuf {
    let dir = directories::ProjectDirs::from("", "", "buddy")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("buddy.db")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = db::Db::open(&database_path()).expect("failed to open database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            sessions: pty::SessionManager::new(),
            clis: Mutex::new(Vec::new()),
            db,
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::list_clis,
            commands::install::install_specs,
            commands::install::node_status,
            commands::install::install_cli,
            commands::terminal::start_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::kill_terminal,
            commands::files::read_dir,
            commands::files::read_file,
            commands::files::write_file,
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::profiles::list_profiles,
            commands::profiles::add_profile,
            commands::profiles::update_profile,
            commands::profiles::remove_profile,
            commands::sessions::list_sessions,
            commands::sessions::remove_session,
            commands::sessions::clear_sessions,
            commands::sessions::list_resumable,
            commands::sessions::read_transcript,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
