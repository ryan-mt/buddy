//! SQLite persistence (via `rusqlite`, bundled) for app data that should
//! outlive a session: the user's projects, profiles, and session history.

mod profiles;
mod sessions;

pub use profiles::Profile;
pub use sessions::{NewSession, SessionRecord};

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
}

pub struct Db {
    conn: Mutex<Connection>,
    /// Parent folder under which each profile's isolated config dir is created.
    profiles_dir: PathBuf,
}

impl Db {
    /// Open (creating if needed) the database at `path` and ensure the schema.
    /// Profile config dirs live in `profiles/` next to the database file.
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path).map_err(db_err)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                path       TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
            CREATE TABLE IF NOT EXISTS profiles (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                color      TEXT NOT NULL,
                config_dir TEXT NOT NULL,
                model      TEXT,
                base_url   TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id              TEXT PRIMARY KEY,
                cli             TEXT NOT NULL,
                title           TEXT NOT NULL,
                cwd             TEXT,
                profile_id      TEXT,
                model           TEXT,
                permission_mode TEXT,
                effort          TEXT,
                status          TEXT NOT NULL DEFAULT 'running',
                exit_code       INTEGER,
                created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                last_active_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );",
        )
        .map_err(db_err)?;
        let profiles_dir = path
            .parent()
            .map(|p| p.join("profiles"))
            .unwrap_or_else(|| PathBuf::from("profiles"));
        Ok(Self {
            conn: Mutex::new(conn),
            profiles_dir,
        })
    }

    pub fn list_projects(&self) -> AppResult<Vec<Project>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT id, name, path FROM projects ORDER BY created_at ASC")
            .map_err(db_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    path: r.get(2)?,
                })
            })
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    /// Add a project for `path` (name derived from its last component). A path
    /// already present is left untouched.
    pub fn add_project(&self, path: &str) -> AppResult<()> {
        let name = Path::new(path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(path)
            .to_string();
        let id = uuid::Uuid::new_v4().to_string();
        self.lock()?
            .execute(
                "INSERT OR IGNORE INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
                (id, name, path),
            )
            .map_err(db_err)?;
        Ok(())
    }

    pub fn remove_project(&self, id: &str) -> AppResult<()> {
        self.lock()?
            .execute("DELETE FROM projects WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }

    fn lock(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Other("database lock poisoned".into()))
    }
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Other(format!("database error: {e}"))
}
