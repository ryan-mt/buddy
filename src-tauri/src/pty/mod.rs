//! PTY-backed terminal sessions.

mod manager;
mod session;

pub use manager::SessionManager;
pub use session::{SpawnSpec, TerminalMsg};
