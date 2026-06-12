//! Persistence for the built-in chat: threads + messages, plus the CLI
//! session ids (`claude -p --resume` / `codex exec resume`) that let a thread
//! continue server-side without replaying its history.
//!
//! Threads are written whole (delete + reinsert in one transaction) — they are
//! small, and it keeps the command surface to a single `save_chat`.

use super::{db_err, Db};
use crate::error::AppResult;
use rusqlite::Row;
use serde::{Deserialize, Serialize};

/// A chat project: a folder on disk that groups threads. Chats inside it run
/// their CLI turns with the folder as cwd, and optional instructions are
/// injected at the start of every session opened inside it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatProject {
    pub id: String,
    pub name: String,
    pub instructions: String,
    /// Absolute folder path; empty for projects from before they were
    /// folder-backed (those behave like plain groups).
    #[serde(default)]
    pub path: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Thread summary for the sidebar list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMeta {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub model: String,
    /// Claude Code session to `--resume` for the next turn in this thread.
    pub claude_session_id: Option<String>,
    /// Codex thread to `exec resume` for the next turn in this thread.
    pub codex_session_id: Option<String>,
    /// Owning chat project; None = ungrouped.
    pub project_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: i64,
}

/// One item of the agent's TodoWrite plan.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub content: String,
    /// "pending" | "in_progress" | "completed".
    pub status: String,
}

/// One tool the agent used during a turn ("Read" + "lib/bindings.ts", …).
/// Every field beyond label/detail defaults for rows persisted before it existed.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAction {
    pub label: String,
    pub detail: String,
    /// Tool-call id (Claude `tool_use` id / Codex item id); ties results back.
    #[serde(default)]
    pub id: Option<String>,
    /// Owning Task tool id — set on subagent actions, rendered nested.
    #[serde(default)]
    pub parent_id: Option<String>,
    /// "running" | "ok" | "error"; None = unknown (legacy or interrupted turn).
    #[serde(default)]
    pub status: Option<String>,
    /// Short tool-result preview (command output, error text, …).
    #[serde(default)]
    pub output: Option<String>,
    /// TodoWrite snapshot — rendered as the plan checklist.
    #[serde(default)]
    pub todos: Option<Vec<TodoItem>>,
}

/// One persisted chat message. Assistant messages record which provider/model
/// produced them (threads can mix models turn by turn) plus token usage and
/// the tool actions taken along the way.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    /// Stored as JSON; absent on rows from before the column existed.
    #[serde(default)]
    pub actions: Vec<ChatAction>,
    pub created_at: i64,
}

/// Full thread upsert payload from the frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChat {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub model: String,
    pub claude_session_id: Option<String>,
    pub codex_session_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub messages: Vec<ChatMessage>,
}

/// A thread loaded in full (meta + ordered messages).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    pub meta: ChatMeta,
    pub messages: Vec<ChatMessage>,
}

fn meta_from_row(r: &Row<'_>) -> rusqlite::Result<ChatMeta> {
    Ok(ChatMeta {
        id: r.get(0)?,
        title: r.get(1)?,
        provider: r.get(2)?,
        model: r.get(3)?,
        claude_session_id: r.get(4)?,
        codex_session_id: r.get(5)?,
        project_id: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
        message_count: r.get(9)?,
    })
}

const META_SELECT: &str = "SELECT c.id, c.title, c.provider, c.model, \
                           c.claude_session_id, c.codex_session_id, c.project_id, \
                           c.created_at, c.updated_at, \
                           (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = c.id) \
                           FROM chats c";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl Db {
    pub fn list_chats(&self) -> AppResult<Vec<ChatMeta>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(&format!("{META_SELECT} ORDER BY c.updated_at DESC"))
            .map_err(db_err)?;
        let rows = stmt.query_map([], meta_from_row).map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    pub fn get_chat(&self, id: &str) -> AppResult<Option<ChatThread>> {
        let conn = self.lock()?;
        let meta = {
            let mut stmt = conn
                .prepare(&format!("{META_SELECT} WHERE c.id = ?1"))
                .map_err(db_err)?;
            let mut rows = stmt.query([id]).map_err(db_err)?;
            match rows.next().map_err(db_err)? {
                Some(r) => meta_from_row(r).map_err(db_err)?,
                None => return Ok(None),
            }
        };
        let mut stmt = conn
            .prepare(
                "SELECT id, role, content, thinking, provider, model, input_tokens, output_tokens, actions, created_at \
                 FROM chat_messages WHERE chat_id = ?1 ORDER BY idx ASC",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map([id], |r| {
                let actions: Option<String> = r.get(8)?;
                Ok(ChatMessage {
                    id: r.get(0)?,
                    role: r.get(1)?,
                    content: r.get(2)?,
                    thinking: r.get(3)?,
                    provider: r.get(4)?,
                    model: r.get(5)?,
                    input_tokens: r.get(6)?,
                    output_tokens: r.get(7)?,
                    // Tolerate hand-edited/legacy payloads: bad JSON = no rows.
                    actions: actions
                        .and_then(|a| serde_json::from_str(&a).ok())
                        .unwrap_or_default(),
                    created_at: r.get(9)?,
                })
            })
            .map_err(db_err)?;
        let messages = rows.collect::<Result<Vec<_>, _>>().map_err(db_err)?;
        Ok(Some(ChatThread { meta, messages }))
    }

    /// Upsert a whole thread. `created_at` is preserved on existing rows.
    pub fn save_chat(&self, chat: &SaveChat) -> AppResult<()> {
        let now = now_ms();
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute(
            "INSERT INTO chats (id, title, provider, model, claude_session_id, codex_session_id, project_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
             ON CONFLICT(id) DO UPDATE SET
               title = ?2, provider = ?3, model = ?4,
               claude_session_id = ?5, codex_session_id = ?6, project_id = ?7, updated_at = ?8",
            rusqlite::params![
                chat.id,
                chat.title,
                chat.provider,
                chat.model,
                chat.claude_session_id,
                chat.codex_session_id,
                chat.project_id,
                now
            ],
        )
        .map_err(db_err)?;
        tx.execute("DELETE FROM chat_messages WHERE chat_id = ?1", [&chat.id])
            .map_err(db_err)?;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO chat_messages \
                     (id, chat_id, idx, role, content, thinking, provider, model, input_tokens, output_tokens, actions, created_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                )
                .map_err(db_err)?;
            for (i, m) in chat.messages.iter().enumerate() {
                let actions = if m.actions.is_empty() {
                    None
                } else {
                    serde_json::to_string(&m.actions).ok()
                };
                stmt.execute(rusqlite::params![
                    m.id,
                    chat.id,
                    i as i64,
                    m.role,
                    m.content,
                    m.thinking,
                    m.provider,
                    m.model,
                    m.input_tokens,
                    m.output_tokens,
                    actions,
                    m.created_at,
                ])
                .map_err(db_err)?;
            }
        }
        tx.commit().map_err(db_err)
    }

    pub fn delete_chat(&self, id: &str) -> AppResult<()> {
        // One transaction: a crash between the two deletes must not leave an
        // empty husk of a thread behind.
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute("DELETE FROM chat_messages WHERE chat_id = ?1", [id])
            .map_err(db_err)?;
        tx.execute("DELETE FROM chats WHERE id = ?1", [id])
            .map_err(db_err)?;
        tx.commit().map_err(db_err)
    }

    /// Move a thread into a project (or out of any, with None).
    pub fn set_chat_project(&self, chat_id: &str, project_id: Option<&str>) -> AppResult<()> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE chats SET project_id = ?2 WHERE id = ?1",
            rusqlite::params![chat_id, project_id],
        )
        .map_err(db_err)?;
        Ok(())
    }

    pub fn list_chat_projects(&self) -> AppResult<Vec<ChatProject>> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, instructions, path, created_at, updated_at \
                 FROM chat_projects ORDER BY created_at ASC",
            )
            .map_err(db_err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ChatProject {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    instructions: r.get(2)?,
                    path: r.get(3)?,
                    created_at: r.get(4)?,
                    updated_at: r.get(5)?,
                })
            })
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }

    /// Upsert a project. `created_at` is preserved on existing rows.
    pub fn save_chat_project(&self, project: &ChatProject) -> AppResult<()> {
        let now = now_ms();
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO chat_projects (id, name, instructions, path, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)
             ON CONFLICT(id) DO UPDATE SET name = ?2, instructions = ?3, path = ?4, updated_at = ?5",
            rusqlite::params![project.id, project.name, project.instructions, project.path, now],
        )
        .map_err(db_err)?;
        Ok(())
    }

    /// Delete a project; its threads survive and become ungrouped.
    pub fn delete_chat_project(&self, id: &str) -> AppResult<()> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(db_err)?;
        tx.execute("UPDATE chats SET project_id = NULL WHERE project_id = ?1", [id])
            .map_err(db_err)?;
        tx.execute("DELETE FROM chat_projects WHERE id = ?1", [id])
            .map_err(db_err)?;
        tx.commit().map_err(db_err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> (Db, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!("buddy-chats-test-{}.db", uuid::Uuid::new_v4()));
        (Db::open(&path).expect("open test db"), path)
    }

    fn sample_chat(id: &str, project_id: Option<&str>) -> SaveChat {
        SaveChat {
            id: id.into(),
            title: "t".into(),
            provider: "anthropic".into(),
            model: "".into(),
            claude_session_id: None,
            codex_session_id: None,
            project_id: project_id.map(String::from),
            messages: vec![],
        }
    }

    #[test]
    fn message_actions_round_trip() {
        let (db, path) = open_test_db();
        let mut chat = sample_chat("c-act", None);
        chat.messages = vec![
            ChatMessage {
                id: "m1".into(),
                role: "user".into(),
                content: "hi".into(),
                thinking: None,
                provider: None,
                model: None,
                input_tokens: None,
                output_tokens: None,
                actions: vec![],
                created_at: 1,
            },
            ChatMessage {
                id: "m2".into(),
                role: "assistant".into(),
                content: "done".into(),
                thinking: None,
                provider: Some("anthropic".into()),
                model: Some("".into()),
                input_tokens: Some(10),
                output_tokens: Some(5),
                actions: vec![
                    ChatAction { label: "Read".into(), detail: "src/a.rs".into(), ..Default::default() },
                    ChatAction {
                        label: "Spawned agent".into(),
                        detail: "explore".into(),
                        id: Some("tu_1".into()),
                        status: Some("ok".into()),
                        output: Some("done".into()),
                        todos: Some(vec![TodoItem { content: "step".into(), status: "completed".into() }]),
                        ..Default::default()
                    },
                ],
                created_at: 2,
            },
        ];
        db.save_chat(&chat).unwrap();

        let loaded = db.get_chat("c-act").unwrap().expect("thread exists");
        assert!(loaded.messages[0].actions.is_empty());
        assert_eq!(loaded.messages[1].actions.len(), 2);
        assert_eq!(loaded.messages[1].actions[0].label, "Read");
        assert_eq!(loaded.messages[1].actions[0].id, None);
        let agent = &loaded.messages[1].actions[1];
        assert_eq!(agent.id.as_deref(), Some("tu_1"));
        assert_eq!(agent.status.as_deref(), Some("ok"));
        assert_eq!(agent.output.as_deref(), Some("done"));
        assert_eq!(agent.todos.as_ref().unwrap()[0].status, "completed");

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn chat_project_crud_and_ungroup_on_delete() {
        let (db, path) = open_test_db();

        let project = ChatProject {
            id: "p1".into(),
            name: "Research".into(),
            instructions: "Always answer in bullet points.".into(),
            path: "C:\\work\\research".into(),
            created_at: 0,
            updated_at: 0,
        };
        db.save_chat_project(&project).unwrap();
        db.save_chat(&sample_chat("c1", Some("p1"))).unwrap();
        db.save_chat(&sample_chat("c2", None)).unwrap();

        let projects = db.list_chat_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "Research");
        assert_eq!(projects[0].path, "C:\\work\\research");
        let metas = db.list_chats().unwrap();
        assert_eq!(
            metas.iter().find(|m| m.id == "c1").unwrap().project_id.as_deref(),
            Some("p1")
        );
        assert_eq!(metas.iter().find(|m| m.id == "c2").unwrap().project_id, None);

        // Rename preserves created_at semantics (upsert path).
        db.save_chat_project(&ChatProject { name: "Research v2".into(), ..project.clone() })
            .unwrap();
        assert_eq!(db.list_chat_projects().unwrap()[0].name, "Research v2");

        // Move c2 in, then delete the project: threads survive, ungrouped.
        db.set_chat_project("c2", Some("p1")).unwrap();
        db.delete_chat_project("p1").unwrap();
        assert!(db.list_chat_projects().unwrap().is_empty());
        let metas = db.list_chats().unwrap();
        assert_eq!(metas.len(), 2);
        assert!(metas.iter().all(|m| m.project_id.is_none()));

        drop(db);
        let _ = std::fs::remove_file(path);
    }
}
