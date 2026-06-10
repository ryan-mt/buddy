//! Shared application state managed by Tauri.

use crate::cli::CliInfo;
use crate::db::Db;
use crate::pty::SessionManager;
use std::sync::Mutex;

pub struct AppState {
    /// Live PTY sessions.
    pub sessions: SessionManager,
    /// Cached detection of the supported agent CLIs (populated by `list_clis`).
    pub clis: Mutex<Vec<CliInfo>>,
    /// Persistent storage (projects).
    pub db: Db,
}
