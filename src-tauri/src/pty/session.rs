//! A single live PTY session.

use crate::error::{AppError, AppResult};
use portable_pty::{ChildKiller, MasterPty, PtySize};
use serde::Serialize;
use std::io::Write;
use std::sync::Mutex;

/// A message streamed from a PTY session to the frontend.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TerminalMsg {
    /// A chunk of raw terminal output, base64-encoded so multi-byte UTF-8
    /// sequences split across reads survive JSON transport intact.
    Output { data: String },
    /// The child process exited.
    Exit { code: Option<i32> },
}

/// How to launch a PTY-backed process.
pub struct SpawnSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    /// Environment overrides applied on top of the inherited parent environment.
    pub env: Vec<(String, String)>,
    pub rows: u16,
    pub cols: u16,
}

/// The parent side of a running PTY: lets us write input, resize, and kill.
///
/// `killer` is a detached handle (via `clone_killer`) so we can terminate the
/// child without contending for the lock the waiter thread holds in `wait()`.
pub struct PtySession {
    pub(crate) writer: Mutex<Box<dyn Write + Send>>,
    pub(crate) master: Mutex<Box<dyn MasterPty + Send>>,
    pub(crate) killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

impl PtySession {
    pub fn write(&self, data: &[u8]) -> AppResult<()> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| AppError::Pty("writer lock poisoned".into()))?;
        writer.write_all(data)?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, rows: u16, cols: u16) -> AppResult<()> {
        let master = self
            .master
            .lock()
            .map_err(|_| AppError::Pty("master lock poisoned".into()))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Pty(e.to_string()))
    }

    pub fn kill(&self) -> AppResult<()> {
        let mut killer = self
            .killer
            .lock()
            .map_err(|_| AppError::Pty("killer lock poisoned".into()))?;
        killer.kill()?;
        Ok(())
    }
}
