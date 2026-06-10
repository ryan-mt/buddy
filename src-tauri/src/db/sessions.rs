//! Session history — every launched session is recorded so it survives an app
//! restart and (for CLIs that support it, e.g. Claude `--resume`) can be
//! relaunched against its prior transcript.

use super::{db_err, Db};
use crate::error::AppResult;
use rusqlite::Row;
use serde::Serialize;

/// A persisted session row, returned to the history view.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub cli: String,
    pub title: String,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub effort: Option<String>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub created_at: i64,
    pub last_active_at: i64,
}

/// The fields needed to record a freshly started session.
pub struct NewSession {
    pub id: String,
    pub cli: String,
    pub title: String,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub effort: Option<String>,
}

impl SessionRecord {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(SessionRecord {
            id: r.get(0)?,
            cli: r.get(1)?,
            title: r.get(2)?,
            cwd: r.get(3)?,
            profile_id: r.get(4)?,
            model: r.get(5)?,
            permission_mode: r.get(6)?,
            effort: r.get(7)?,
            status: r.get(8)?,
            exit_code: r.get(9)?,
            created_at: r.get(10)?,
            last_active_at: r.get(11)?,
        })
    }
}

const SELECT: &str = "SELECT id, cli, title, cwd, profile_id, model, permission_mode, effort, \
                      status, exit_code, created_at, last_active_at FROM sessions";

impl Db {
    /// Record a started session (status = running). Re-running the same id (a
    /// resume) refreshes its row and marks it running again.
    pub fn persist_session(&self, s: &NewSession) -> AppResult<()> {
        self.lock()?
            .execute(
                "INSERT INTO sessions
                   (id, cli, title, cwd, profile_id, model, permission_mode, effort, status, last_active_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'running', strftime('%s','now'))
                 ON CONFLICT(id) DO UPDATE SET
                   status = 'running', exit_code = NULL, last_active_at = strftime('%s','now')",
                rusqlite::params![
                    s.id,
                    s.cli,
                    s.title,
                    s.cwd,
                    s.profile_id,
                    s.model,
                    s.permission_mode,
                    s.effort,
                ],
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn mark_session_exited(&self, id: &str, code: Option<i32>) -> AppResult<()> {
        self.lock()?
            .execute(
                "UPDATE sessions
                   SET status = 'exited', exit_code = ?2, last_active_at = strftime('%s','now')
                 WHERE id = ?1",
                rusqlite::params![id, code],
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn list_sessions(&self) -> AppResult<Vec<SessionRecord>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(&format!("{SELECT} ORDER BY last_active_at DESC"))
            .map_err(db_err)?;
        let rows = stmt
            .query_map([], SessionRecord::from_row)
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    pub fn get_session(&self, id: &str) -> AppResult<Option<SessionRecord>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(&format!("{SELECT} WHERE id = ?1"))
            .map_err(db_err)?;
        let mut rows = stmt.query([id]).map_err(db_err)?;
        match rows.next().map_err(db_err)? {
            Some(r) => Ok(Some(SessionRecord::from_row(r).map_err(db_err)?)),
            None => Ok(None),
        }
    }

    /// Rename a session (the UI lets users retitle tabs; keep history in sync).
    pub fn rename_session(&self, id: &str, title: &str) -> AppResult<()> {
        self.lock()?
            .execute(
                "UPDATE sessions SET title = ?2 WHERE id = ?1",
                rusqlite::params![id, title],
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn remove_session(&self, id: &str) -> AppResult<()> {
        self.lock()?
            .execute("DELETE FROM sessions WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }

    /// Drop all exited rows (the history "Clear" action).
    pub fn clear_exited_sessions(&self) -> AppResult<()> {
        self.lock()?
            .execute("DELETE FROM sessions WHERE status = 'exited'", [])
            .map_err(db_err)?;
        Ok(())
    }
}
