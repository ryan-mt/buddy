//! CRUD for profiles — named, isolated CLI configurations. Each profile owns a
//! private config directory (its own `CLAUDE_CONFIG_DIR` / `CODEX_HOME`) so the
//! user can keep several accounts/logins fully separated, plus optional model
//! and base-url overrides.

use super::{db_err, Db};
use crate::error::AppResult;
use rusqlite::Row;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub color: String,
    /// Absolute path to this profile's isolated config dir.
    pub config_dir: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

impl Profile {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Profile {
            id: r.get(0)?,
            name: r.get(1)?,
            color: r.get(2)?,
            config_dir: r.get(3)?,
            model: r.get(4)?,
            base_url: r.get(5)?,
        })
    }
}

const SELECT: &str = "SELECT id, name, color, config_dir, model, base_url FROM profiles";

impl Db {
    pub fn list_profiles(&self) -> AppResult<Vec<Profile>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(&format!("{SELECT} ORDER BY created_at ASC"))
            .map_err(db_err)?;
        let rows = stmt.query_map([], Profile::from_row).map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    /// Create a profile with a freshly made, isolated config directory.
    pub fn add_profile(
        &self,
        name: &str,
        color: &str,
        model: Option<&str>,
        base_url: Option<&str>,
    ) -> AppResult<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let dir = self.profiles_dir.join(&id);
        std::fs::create_dir_all(&dir)?;
        let config_dir = dir.to_string_lossy().into_owned();
        let inserted = self
            .lock()?
            .execute(
                "INSERT INTO profiles (id, name, color, config_dir, model, base_url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![id, name, color, config_dir, model, base_url],
            )
            .map_err(db_err);
        if let Err(e) = inserted {
            // Don't leave an orphaned (and still empty) config dir behind.
            let _ = std::fs::remove_dir(&dir);
            return Err(e);
        }
        Ok(())
    }

    pub fn update_profile(
        &self,
        id: &str,
        name: &str,
        color: &str,
        model: Option<&str>,
        base_url: Option<&str>,
    ) -> AppResult<()> {
        self.lock()?
            .execute(
                "UPDATE profiles SET name = ?2, color = ?3, model = ?4, base_url = ?5 WHERE id = ?1",
                rusqlite::params![id, name, color, model, base_url],
            )
            .map_err(db_err)?;
        Ok(())
    }

    /// Remove the profile row. The config directory is intentionally left on disk
    /// so a stored login is not destroyed by an accidental delete.
    pub fn remove_profile(&self, id: &str) -> AppResult<()> {
        self.lock()?
            .execute("DELETE FROM profiles WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }

    pub fn get_profile(&self, id: &str) -> AppResult<Option<Profile>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(&format!("{SELECT} WHERE id = ?1"))
            .map_err(db_err)?;
        let mut rows = stmt.query([id]).map_err(db_err)?;
        match rows.next().map_err(db_err)? {
            Some(r) => Ok(Some(Profile::from_row(r).map_err(db_err)?)),
            None => Ok(None),
        }
    }
}
