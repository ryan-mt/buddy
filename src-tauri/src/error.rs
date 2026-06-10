//! Unified error type for the backend.
//!
//! Every Tauri command returns [`AppResult`], so errors serialize to the
//! frontend as `{ code, message }` instead of leaking opaque strings.

use serde::ser::{Serialize, SerializeStruct, Serializer};

/// All errors surfaced by the backend.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("CLI not available: {0:?}")]
    CliNotFound(crate::cli::CliKind),

    #[error("terminal session not found: {0}")]
    SessionNotFound(uuid::Uuid),

    #[error("PTY error: {0}")]
    Pty(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    /// Stable machine-readable code, used by the frontend to branch on errors.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::CliNotFound(_) => "cli_not_found",
            AppError::SessionNotFound(_) => "session_not_found",
            AppError::Pty(_) => "pty",
            AppError::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
