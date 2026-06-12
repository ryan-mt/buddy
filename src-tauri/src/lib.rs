mod cli;
mod commands;
mod db;
mod error;
mod pty;
mod state;

use state::AppState;
use std::sync::Mutex;

/// buddy's data folder under the OS data dir, created on first use.
pub(crate) fn data_dir() -> std::path::PathBuf {
    let dir = directories::ProjectDirs::from("", "", "buddy")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Resolve the on-disk database path under the OS data dir.
fn database_path() -> std::path::PathBuf {
    data_dir().join("buddy.db")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // GUI launches (Finder/Dock, desktop launchers) start with a minimal PATH;
    // merge the user's login-shell PATH so CLI detection, git, node and every
    // spawned session see the same tools their terminal does.
    cli::path_env::bootstrap();

    // WebKitGTK's DMA-BUF renderer blanks the window on NVIDIA's proprietary
    // driver (and some VMs); disable it unless the user chose explicitly.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && std::path::Path::new("/proc/driver/nvidia").exists()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let db = db::Db::open(&database_path()).expect("failed to open database");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            sessions: pty::SessionManager::new(),
            clis: Mutex::new(Vec::new()),
            db,
            chat_cancels: Mutex::new(std::collections::HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::list_clis,
            commands::app::reveal_data_dir,
            commands::install::install_specs,
            commands::install::node_status,
            commands::install::install_cli,
            commands::update::check_cli_updates,
            commands::update::update_cli,
            commands::terminal::start_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::kill_terminal,
            commands::git::git_changes,
            commands::git::git_file_diff,
            commands::files::read_dir,
            commands::files::read_file,
            commands::files::write_file,
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::projects::reveal_path,
            commands::profiles::list_profiles,
            commands::profiles::add_profile,
            commands::profiles::update_profile,
            commands::profiles::remove_profile,
            commands::sessions::list_sessions,
            commands::sessions::rename_session,
            commands::sessions::remove_session,
            commands::sessions::clear_sessions,
            commands::sessions::list_resumable,
            commands::sessions::read_transcript,
            commands::chat::list_chats,
            commands::chat::get_chat,
            commands::chat::save_chat,
            commands::chat::delete_chat,
            commands::chat::list_chat_projects,
            commands::chat::save_chat_project,
            commands::chat::delete_chat_project,
            commands::chat::set_chat_project,
            commands::chat::chat_stream,
            commands::chat::chat_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // Make sure no CLI process lingers after the window is gone.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                let state = app_handle.state::<AppState>();
                state.sessions.kill_all();
                // Best-effort: wake in-flight chat turns so their CLI children
                // get killed instead of running headless past app exit.
                if let Ok(cancels) = state.chat_cancels.lock() {
                    for cancel in cancels.values() {
                        cancel.notify_one();
                    }
                };
            }
        });
}
