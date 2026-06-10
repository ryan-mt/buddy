//! Filesystem commands backing the project workspace (file tree + editor).

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::cmp::Ordering;

/// Refuse to load files large enough to choke the editor.
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// List a directory's immediate children, directories first then files,
/// each group sorted case-insensitively by name.
#[tauri::command]
pub fn read_dir(path: String) -> AppResult<Vec<DirEntry>> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&path)? {
        let entry = entry?;
        let is_dir = entry.file_type()?.is_dir();
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

/// Read a UTF-8 text file. Binary or oversized files are rejected with a
/// message the editor can show instead of loading garbage.
#[tauri::command]
pub fn read_file(path: String) -> AppResult<String> {
    let len = std::fs::metadata(&path)?.len();
    if len > MAX_FILE_BYTES {
        return Err(AppError::Other(format!(
            "file too large to open ({} KB)",
            len / 1024
        )));
    }
    let bytes = std::fs::read(&path)?;
    String::from_utf8(bytes).map_err(|_| AppError::Other("file is not UTF-8 text".into()))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> AppResult<()> {
    std::fs::write(&path, content)?;
    Ok(())
}
