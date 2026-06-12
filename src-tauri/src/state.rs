//! Shared application state managed by Tauri.

use crate::cli::CliInfo;
use crate::db::Db;
use crate::pty::SessionManager;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

pub struct AppState {
    /// Live PTY sessions.
    pub sessions: SessionManager,
    /// Cached detection of the supported agent CLIs (populated by `list_clis`).
    pub clis: Mutex<Vec<CliInfo>>,
    /// Persistent storage (projects).
    pub db: Db,
    /// Cancellation handles for in-flight chat streams, keyed by stream id.
    pub chat_cancels: Mutex<HashMap<String, Arc<Notify>>>,
}
