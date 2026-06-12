//! The built-in chat. It drives the locally installed agent CLIs in headless
//! mode (`claude -p`, `codex exec`) so it rides the user's existing CLI logins
//! — no API keys to manage. Commands + shared wire types live here; process
//! transport is in `stream`, per-CLI args/event parsing in `providers`.

mod providers;
mod stream;

use crate::cli::{detect, CliKind};
use crate::db::{ChatAction, ChatMeta, ChatProject, ChatThread, SaveChat};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Notify;

/// Map a chat provider tag (kept stable for persisted threads) to its CLI.
pub(crate) fn cli_kind(provider: &str) -> Option<CliKind> {
    match provider {
        "anthropic" => Some(CliKind::Claude),
        "openai" => Some(CliKind::Codex),
        _ => None,
    }
}

// --- wire types ---------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamOpts {
    pub provider: String, // "anthropic" | "openai"
    /// None/empty = the CLI's own configured default model.
    pub model: Option<String>,
    /// This turn's prompt. Prior turns live in the CLI session; when no
    /// session exists yet the frontend embeds a transcript block here.
    pub prompt: String,
    /// CLI session/thread id from the previous turn in this thread.
    pub resume: Option<String>,
    /// CLI effort value, already mapped/clamped by the frontend; None = default.
    pub effort: Option<String>,
    /// Working directory for the CLI turn — the chat project's folder. The
    /// CLI can read/edit files there, and session resume stays scoped to it.
    #[serde(default)]
    pub cwd: Option<String>,
    /// Tool access for the turn: "chat" (no tools), "read" (read-only trio),
    /// "full" (entire toolset, permission prompts bypassed — headless runs
    /// can't answer them). None falls back to read-in-project / chat outside.
    #[serde(default)]
    pub access: Option<String>,
}

/// Streamed back over the channel. Mirrors the frontend `ChatStreamMsg` union.
/// `rename_all` only covers variant names; `rename_all_fields` is what puts
/// the fields themselves (inputTokens, stopReason, …) in camelCase.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind")]
pub enum ChatMsg {
    Delta { text: String },
    Thinking { text: String },
    /// A tool the agent used this turn ("Read" + "src/app.ts", "Ran" + a
    /// command, …) — rendered as the action timeline above the reply.
    /// Subagent calls carry `parent_id`; TodoWrite carries the plan snapshot.
    Action { action: ChatAction },
    /// Result of an earlier action, matched by its tool-call id.
    ActionUpdate { id: String, status: String, output: Option<String> },
    /// CLI session id to resume with on the next turn. Sent every turn —
    /// whatever id the CLI reports last is the one to keep.
    Session { id: String },
    Usage { input_tokens: Option<i64>, output_tokens: Option<i64> },
    Done { stop_reason: Option<String>, cancelled: bool },
    Error { message: String },
}

// --- thread persistence ------------------------------------------------------

#[tauri::command]
pub fn list_chats(state: State<'_, AppState>) -> AppResult<Vec<ChatMeta>> {
    state.db.list_chats()
}

#[tauri::command]
pub fn get_chat(state: State<'_, AppState>, id: String) -> AppResult<Option<ChatThread>> {
    state.db.get_chat(&id)
}

#[tauri::command]
pub fn save_chat(state: State<'_, AppState>, chat: SaveChat) -> AppResult<Vec<ChatMeta>> {
    state.db.save_chat(&chat)?;
    state.db.list_chats()
}

#[tauri::command]
pub fn delete_chat(state: State<'_, AppState>, id: String) -> AppResult<Vec<ChatMeta>> {
    state.db.delete_chat(&id)?;
    state.db.list_chats()
}

// --- chat projects -------------------------------------------------------------

#[tauri::command]
pub fn list_chat_projects(state: State<'_, AppState>) -> AppResult<Vec<ChatProject>> {
    state.db.list_chat_projects()
}

#[tauri::command]
pub fn save_chat_project(
    state: State<'_, AppState>,
    project: ChatProject,
) -> AppResult<Vec<ChatProject>> {
    state.db.save_chat_project(&project)?;
    state.db.list_chat_projects()
}

/// Delete a project. Its threads survive, ungrouped — returns both refreshed
/// lists so the frontend can swap state atomically.
#[tauri::command]
pub fn delete_chat_project(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<(Vec<ChatProject>, Vec<ChatMeta>)> {
    state.db.delete_chat_project(&id)?;
    Ok((state.db.list_chat_projects()?, state.db.list_chats()?))
}

/// Move a thread into a project (None = ungroup).
#[tauri::command]
pub fn set_chat_project(
    state: State<'_, AppState>,
    chat_id: String,
    project_id: Option<String>,
) -> AppResult<Vec<ChatMeta>> {
    state.db.set_chat_project(&chat_id, project_id.as_deref())?;
    state.db.list_chats()
}

// --- streaming ---------------------------------------------------------------

/// Start a headless CLI turn. Returns a stream id usable with `chat_cancel`;
/// deltas/usage/session/done arrive on the channel.
#[tauri::command]
pub fn chat_stream(
    app: AppHandle,
    opts: ChatStreamOpts,
    channel: Channel<ChatMsg>,
) -> AppResult<String> {
    let kind = cli_kind(&opts.provider)
        .ok_or_else(|| AppError::Other(format!("unknown chat provider: {}", opts.provider)))?;
    let bin = detect::locate(kind).ok_or_else(|| {
        AppError::Other(format!(
            "{} CLI not found — install it from the sidebar first",
            kind.label()
        ))
    })?;

    let id = uuid::Uuid::new_v4().to_string();
    let cancel = Arc::new(Notify::new());
    app.state::<AppState>()
        .chat_cancels
        .lock()
        .map_err(|_| AppError::Other("chat state poisoned".into()))?
        .insert(id.clone(), cancel.clone());

    let task_id = id.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = stream::run(kind, &bin, &opts, &cancel, &channel).await {
            let _ = channel.send(ChatMsg::Error { message: e.to_string() });
        }
        if let Ok(mut map) = app.state::<AppState>().chat_cancels.lock() {
            map.remove(&task_id);
        }
    });
    Ok(id)
}

/// Cancel an in-flight turn; the CLI process is killed and the stream closes
/// with `Done { cancelled: true }`.
#[tauri::command]
pub fn chat_cancel(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(flag) = state
        .chat_cancels
        .lock()
        .map_err(|_| AppError::Other("chat state poisoned".into()))?
        .get(&id)
    {
        // notify_one stores a permit, so a cancel that lands between two
        // line awaits is still observed by the next `notified()`.
        flag.notify_one();
    }
    Ok(())
}
