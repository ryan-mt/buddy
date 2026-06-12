//! Per-CLI launch arguments and JSONL event parsing.
//!
//! Claude Code: `claude -p --output-format stream-json` wraps Anthropic SSE
//! events in `{"type":"stream_event","event":{…}}` lines, with `system/init`
//! first and a final `result` line. Codex: `codex exec --json` emits
//! `thread.started` / `item.*` / `turn.*` lines. Both verified against the
//! installed CLIs (June 2026).

use super::{ChatMsg, ChatStreamOpts};
use crate::cli::CliKind;
use crate::db::{ChatAction, TodoItem};
use serde_json::Value;
use std::collections::HashSet;
use tauri::ipc::Channel;

// --- launch arguments ----------------------------------------------------------

pub(crate) fn cli_args(kind: CliKind, opts: &ChatStreamOpts) -> Vec<String> {
    let model = opts.model.as_deref().filter(|m| !m.is_empty());
    let resume = opts.resume.as_deref().filter(|r| !r.is_empty());
    let scoped = opts.cwd.as_deref().is_some_and(|c| !c.is_empty());
    // Tool access: explicit from the picker, else the historical default —
    // read-only inside a project, conversation-only outside.
    let access = opts
        .access
        .as_deref()
        .unwrap_or(if scoped { "read" } else { "chat" });
    match kind {
        CliKind::Claude => {
            let mut args: Vec<String> = vec![
                "-p".into(),
                "--output-format".into(),
                "stream-json".into(),
                "--verbose".into(),
                "--include-partial-messages".into(),
            ];
            match access {
                // Full access keeps Claude Code's entire toolset. Headless
                // runs can't answer permission prompts, so they're bypassed —
                // the user opted in explicitly via the composer picker.
                "full" => args.extend(["--permission-mode".into(), "bypassPermissions".into()]),
                // The read-only trio lets the model see the code, nothing
                // that writes or executes.
                "read" => args.extend(["--tools".into(), "Read,Glob,Grep".into()]),
                // Conversation-only: a turn can never touch files.
                _ => args.extend(["--tools".into(), String::new()]),
            }
            if let Some(model) = model {
                args.extend(["--model".into(), model.into()]);
            }
            if let Some(effort) = opts.effort.as_deref() {
                // "ultracode" isn't a --effort value: it's xhigh plus the
                // ultracode settings flag (workflow orchestration opt-in).
                if effort == "ultracode" {
                    args.extend(["--effort".into(), "xhigh".into()]);
                    args.extend(["--settings".into(), r#"{"ultracode":true}"#.into()]);
                } else {
                    args.extend(["--effort".into(), effort.into()]);
                }
            }
            if let Some(resume) = resume {
                args.extend(["--resume".into(), resume.into()]);
            }
            args
        }
        CliKind::Codex => {
            let mut args: Vec<String> = vec!["exec".into()];
            if let Some(resume) = resume {
                args.extend(["resume".into(), resume.into()]);
            }
            args.extend(["--json".into(), "--skip-git-repo-check".into()]);
            if resume.is_none() {
                // The resume subcommand has no --sandbox flag; the session
                // keeps the policy it was created with. Full access maps to
                // workspace-write: edits + commands inside the folder.
                let sandbox = if access == "full" { "workspace-write" } else { "read-only" };
                args.extend(["--sandbox".into(), sandbox.into()]);
            }
            if let Some(model) = model {
                args.extend(["-m".into(), model.into()]);
            }
            if let Some(effort) = opts.effort.as_deref() {
                args.extend(["-c".into(), format!("model_reasoning_effort={effort}")]);
            }
            // "-" = read the prompt from stdin.
            args.push("-".into());
            args
        }
        // Chat only fronts the two CLIs above; `cli_kind` gates earlier.
        _ => Vec::new(),
    }
}

// --- event parsing ---------------------------------------------------------------

/// Stateful per-turn parser. `handle` sends `ChatMsg`s for one JSONL line and
/// returns true once a terminal message (done/error) went out.
pub(crate) enum Parser {
    Claude {
        stop_reason: Option<String>,
    },
    /// Codex item texts arrive as growing snapshots, not deltas — track how
    /// many bytes of each stream we already forwarded. `announced` remembers
    /// which item ids already produced an Action, so completions become
    /// updates instead of duplicate rows.
    Codex {
        agent_sent: usize,
        reasoning_sent: usize,
        announced: HashSet<String>,
    },
}

impl Parser {
    pub(crate) fn new(kind: CliKind) -> Self {
        match kind {
            CliKind::Codex => Parser::Codex {
                agent_sent: 0,
                reasoning_sent: 0,
                announced: HashSet::new(),
            },
            _ => Parser::Claude { stop_reason: None },
        }
    }

    pub(crate) fn handle(&mut self, line: &str, channel: &Channel<ChatMsg>) -> bool {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else {
            return false; // log noise between JSON lines
        };
        match self {
            Parser::Claude { stop_reason } => claude_event(&event, stop_reason, channel),
            Parser::Codex { agent_sent, reasoning_sent, announced } => {
                codex_event(&event, agent_sent, reasoning_sent, announced, channel)
            }
        }
    }
}

/// Handle one `claude -p` stream-json line; returns true when terminal.
fn claude_event(
    event: &Value,
    stop_reason: &mut Option<String>,
    channel: &Channel<ChatMsg>,
) -> bool {
    match event["type"].as_str() {
        Some("system") => {
            if event["subtype"].as_str() == Some("init") {
                if let Some(id) = event["session_id"].as_str() {
                    let _ = channel.send(ChatMsg::Session { id: id.to_string() });
                }
            }
            false
        }
        // Whole assistant messages (the agentic loop emits one per model turn).
        // Text already streamed via stream_event — only the tool calls matter.
        // Events from inside a Task subagent carry `parent_tool_use_id`; their
        // tool calls render nested under the spawning action.
        Some("assistant") => {
            let parent_id = event["parent_tool_use_id"].as_str().map(String::from);
            if let Some(blocks) = event["message"]["content"].as_array() {
                for block in blocks {
                    if block["type"].as_str() != Some("tool_use") {
                        continue;
                    }
                    if let Some(name) = block["name"].as_str() {
                        let mut action = claude_tool_action(name, &block["input"]);
                        action.id = block["id"].as_str().map(String::from);
                        action.parent_id = parent_id.clone();
                        action.status = Some("running".into());
                        let _ = channel.send(ChatMsg::Action { action });
                    }
                }
            }
            false
        }
        // Tool results echo back as user messages — they close out the
        // matching action with ok/error and a short output preview.
        Some("user") => {
            if let Some(blocks) = event["message"]["content"].as_array() {
                for block in blocks {
                    if block["type"].as_str() != Some("tool_result") {
                        continue;
                    }
                    let Some(id) = block["tool_use_id"].as_str() else { continue };
                    let is_error = block["is_error"].as_bool().unwrap_or(false);
                    let _ = channel.send(ChatMsg::ActionUpdate {
                        id: id.to_string(),
                        status: if is_error { "error" } else { "ok" }.to_string(),
                        output: tool_result_text(&block["content"]),
                    });
                }
            }
            false
        }
        // Wrapped Anthropic SSE event — deltas stream through here. Subagent
        // partials (parent_tool_use_id set) are the subagent's own answer, not
        // the main reply — never mix them into the streamed text.
        Some("stream_event") => {
            if !event["parent_tool_use_id"].is_null() {
                return false;
            }
            let inner = &event["event"];
            match inner["type"].as_str() {
                Some("content_block_delta") => match inner["delta"]["type"].as_str() {
                    Some("text_delta") => {
                        if let Some(text) = inner["delta"]["text"].as_str() {
                            let _ = channel.send(ChatMsg::Delta { text: text.to_string() });
                        }
                    }
                    Some("thinking_delta") => {
                        // Empty thinking text = display "omitted"; nothing to show.
                        if let Some(text) = inner["delta"]["thinking"].as_str() {
                            if !text.is_empty() {
                                let _ = channel.send(ChatMsg::Thinking { text: text.to_string() });
                            }
                        }
                    }
                    _ => {}
                },
                Some("message_delta") => {
                    if let Some(reason) = inner["delta"]["stop_reason"].as_str() {
                        *stop_reason = Some(reason.to_string());
                    }
                }
                _ => {}
            }
            false
        }
        // Final line of the run: cumulative usage + success/error.
        Some("result") => {
            let usage = &event["usage"];
            if usage.is_object() {
                let input = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
                    .iter()
                    .filter_map(|k| usage[k].as_i64())
                    .sum::<i64>();
                let _ = channel.send(ChatMsg::Usage {
                    input_tokens: Some(input),
                    output_tokens: usage["output_tokens"].as_i64(),
                });
            }
            if event["is_error"].as_bool().unwrap_or(false) {
                let message = event["result"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .or_else(|| event["error"]["message"].as_str().map(String::from))
                    .unwrap_or_else(|| "Claude Code reported an error".to_string());
                let _ = channel.send(ChatMsg::Error { message });
            } else {
                let _ = channel.send(ChatMsg::Done { stop_reason: stop_reason.clone(), cancelled: false });
            }
            true
        }
        _ => false, // assistant/user echoes, hooks, api_retry, …
    }
}

/// Handle one `codex exec --json` line; returns true when terminal.
fn codex_event(
    event: &Value,
    agent_sent: &mut usize,
    reasoning_sent: &mut usize,
    announced: &mut HashSet<String>,
    channel: &Channel<ChatMsg>,
) -> bool {
    match event["type"].as_str() {
        Some("thread.started") => {
            if let Some(id) = event["thread_id"].as_str() {
                let _ = channel.send(ChatMsg::Session { id: id.to_string() });
            }
            false
        }
        Some("item.started") | Some("item.updated") | Some("item.completed") => {
            let item = &event["item"];
            // Field name has shifted across Codex releases — accept both.
            let item_type = item["item_type"].as_str().or_else(|| item["type"].as_str());
            let text = item["text"].as_str().unwrap_or("");
            match item_type {
                Some("agent_message") => {
                    if let Some(delta) = snapshot_delta(text, agent_sent) {
                        let _ = channel.send(ChatMsg::Delta { text: delta });
                    }
                }
                Some("reasoning") => {
                    if let Some(delta) = snapshot_delta(text, reasoning_sent) {
                        let _ = channel.send(ChatMsg::Thinking { text: delta });
                    }
                }
                // Tool-ish items: announce on start, settle on completion.
                // Items that only ever report completed still get announced.
                _ => {
                    let Some((label, detail)) = codex_item_action(item_type, item) else {
                        return false;
                    };
                    let id = item["id"].as_str().map(String::from);
                    let completed = event["type"].as_str() == Some("item.completed");
                    let started = event["type"].as_str() == Some("item.started");
                    let known = id.as_ref().is_some_and(|i| announced.contains(i));
                    if completed && known {
                        let _ = channel.send(ChatMsg::ActionUpdate {
                            id: id.unwrap_or_default(),
                            status: codex_item_status(item_type, item),
                            output: codex_item_output(item_type, item),
                        });
                    } else if started || (completed && !known) {
                        if let Some(i) = &id {
                            announced.insert(i.clone());
                        }
                        let _ = channel.send(ChatMsg::Action {
                            action: ChatAction {
                                label,
                                detail,
                                id,
                                status: Some(
                                    if completed { codex_item_status(item_type, item) } else { "running".into() },
                                ),
                                output: if completed { codex_item_output(item_type, item) } else { None },
                                ..Default::default()
                            },
                        });
                    }
                }
            }
            false
        }
        Some("turn.completed") => {
            let usage = &event["usage"];
            if usage.is_object() {
                let _ = channel.send(ChatMsg::Usage {
                    input_tokens: usage["input_tokens"].as_i64(),
                    output_tokens: usage["output_tokens"].as_i64(),
                });
            }
            let _ = channel.send(ChatMsg::Done { stop_reason: None, cancelled: false });
            true
        }
        Some("turn.failed") => {
            let message = event["error"]["message"]
                .as_str()
                .unwrap_or("Codex turn failed")
                .to_string();
            let _ = channel.send(ChatMsg::Error { message });
            true
        }
        // Fatal in exec mode (observed: auth failures) — turn.failed may not
        // follow, so treat it as terminal.
        Some("error") => {
            let message = event["message"].as_str().unwrap_or("Codex error").to_string();
            let _ = channel.send(ChatMsg::Error { message });
            true
        }
        _ => false, // turn.started, session config echoes, …
    }
}

/// Map a Claude tool call to a timeline row: a verb plus a compact target.
/// TodoWrite also carries its plan snapshot for the checklist card.
fn claude_tool_action(name: &str, input: &Value) -> ChatAction {
    let file = || input["file_path"].as_str().map(short_path).unwrap_or_default();
    let mut todos: Option<Vec<TodoItem>> = None;
    let (label, detail): (&str, String) = match name {
        "Read" => ("Read", file()),
        "Edit" | "MultiEdit" => ("Edited", file()),
        "Write" | "NotebookEdit" => ("Wrote", file()),
        "Bash" | "PowerShell" => ("Ran", clip(input["command"].as_str().unwrap_or(""), 80)),
        "Glob" => ("Globbed", input["pattern"].as_str().unwrap_or("").to_string()),
        "Grep" => ("Searched", clip(input["pattern"].as_str().unwrap_or(""), 60)),
        "WebFetch" => ("Fetched", clip(input["url"].as_str().unwrap_or(""), 80)),
        "WebSearch" => ("Searched web", clip(input["query"].as_str().unwrap_or(""), 60)),
        "TodoWrite" => {
            todos = input["todos"].as_array().map(|items| {
                items
                    .iter()
                    .filter_map(|t| {
                        Some(TodoItem {
                            content: t["content"].as_str()?.to_string(),
                            status: t["status"].as_str().unwrap_or("pending").to_string(),
                        })
                    })
                    .collect()
            });
            ("Updated plan", String::new())
        }
        // A Task call spawns a subagent; its own tool calls arrive with
        // parent_tool_use_id pointing back at this action.
        "Task" | "Agent" => {
            let desc = input["description"].as_str().unwrap_or("");
            let detail = match input["subagent_type"].as_str() {
                Some(agent) if !agent.is_empty() => format!("{agent} — {desc}"),
                _ => desc.to_string(),
            };
            ("Spawned agent", clip(&detail, 70))
        }
        "Skill" => ("Ran skill", input["skill"].as_str().unwrap_or("").to_string()),
        "SlashCommand" => ("Ran command", clip(input["command"].as_str().unwrap_or(""), 60)),
        "ToolSearch" => ("Searched tools", clip(input["query"].as_str().unwrap_or(""), 60)),
        "ExitPlanMode" => ("Presented plan", String::new()),
        "EnterPlanMode" => ("Entered plan mode", String::new()),
        // MCP tools come through as mcp__server__tool.
        other if other.starts_with("mcp__") => {
            let pretty = other.trim_start_matches("mcp__").replace("__", " · ");
            ("Used", pretty)
        }
        other => ("Used", other.to_string()),
    };
    ChatAction {
        label: label.to_string(),
        detail,
        todos,
        ..Default::default()
    }
}

/// Flatten a tool_result `content` (string or text-block array) into a short
/// multi-line preview for the action row.
fn tool_result_text(content: &Value) -> Option<String> {
    let text = match content {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => return None,
    };
    let clipped = clip_block(&text, 8, 600);
    if clipped.is_empty() { None } else { Some(clipped) }
}

/// "ok"/"error" for a completed Codex item.
fn codex_item_status(item_type: Option<&str>, item: &Value) -> String {
    let failed = match item_type {
        Some("command_execution") => item["exit_code"].as_i64().is_some_and(|c| c != 0),
        _ => item["status"].as_str() == Some("failed"),
    };
    if failed { "error".into() } else { "ok".into() }
}

/// Short output preview for a completed Codex item (command output today).
fn codex_item_output(item_type: Option<&str>, item: &Value) -> Option<String> {
    match item_type {
        Some("command_execution") => {
            let out = item["aggregated_output"].as_str().unwrap_or("");
            let clipped = clip_block(out, 8, 600);
            if clipped.is_empty() { None } else { Some(clipped) }
        }
        _ => None,
    }
}

/// Map a Codex non-text item to a timeline row (None for unknown item kinds).
fn codex_item_action(item_type: Option<&str>, item: &Value) -> Option<(String, String)> {
    match item_type {
        Some("command_execution") => Some((
            "Ran".into(),
            clip(item["command"].as_str().unwrap_or(""), 80),
        )),
        Some("file_change") | Some("patch_apply") => {
            // Newer Codex lists the touched files; fall back to a plain label.
            let detail = item["changes"]
                .as_array()
                .map(|c| {
                    c.iter()
                        .filter_map(|ch| ch["path"].as_str())
                        .map(short_path)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            Some(("Edited".into(), clip(&detail, 80)))
        }
        Some("web_search") => Some((
            "Searched web".into(),
            clip(item["query"].as_str().unwrap_or(""), 60),
        )),
        Some("mcp_tool_call") => Some((
            "Used".into(),
            item["tool"].as_str().unwrap_or("MCP tool").to_string(),
        )),
        _ => None,
    }
}

/// Last two path components — enough to recognize a file without the noise.
fn short_path(path: &str) -> String {
    let parts: Vec<&str> = path.split(['/', '\\']).filter(|p| !p.is_empty()).collect();
    match parts.as_slice() {
        [] => path.to_string(),
        [one] => (*one).to_string(),
        [.., a, b] => format!("{a}/{b}"),
    }
}

/// Multi-line clip for result previews: at most `max_lines` lines and
/// `max_chars` characters, with an ellipsis when anything was cut.
fn clip_block(text: &str, max_lines: usize, max_chars: usize) -> String {
    let trimmed = text.trim();
    let kept: Vec<&str> = trimmed.lines().take(max_lines).collect();
    let cut_lines = trimmed.lines().count() > max_lines;
    let block = kept.join("\n");
    if block.chars().count() > max_chars {
        let cut: String = block.chars().take(max_chars).collect();
        return format!("{cut}…");
    }
    if cut_lines {
        format!("{block}\n…")
    } else {
        block
    }
}

/// Single-line clip for command/query details.
fn clip(text: &str, max: usize) -> String {
    let line = text.lines().next().unwrap_or("").trim();
    if line.chars().count() <= max {
        return line.to_string();
    }
    let cut: String = line.chars().take(max).collect();
    format!("{cut}…")
}

/// Codex sends item text as the full snapshot so far; return only the part we
/// haven't forwarded yet (resetting if the text shrank or got rewritten).
fn snapshot_delta(text: &str, sent: &mut usize) -> Option<String> {
    if text.is_empty() {
        return None;
    }
    if *sent > text.len() || !text.is_char_boundary(*sent) {
        *sent = 0; // rewritten snapshot — start over rather than mis-slice
    }
    let delta = &text[*sent..];
    if delta.is_empty() {
        return None;
    }
    *sent = text.len();
    Some(delta.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_args_disable_tools_and_resume() {
        let opts = ChatStreamOpts {
            provider: "anthropic".into(),
            model: Some("claude-opus-4-8".into()),
            prompt: "hi".into(),
            resume: Some("abc".into()),
            effort: Some("high".into()),
            cwd: None,
            access: None,
        };
        let args = cli_args(CliKind::Claude, &opts);
        assert!(args.windows(2).any(|w| w[0] == "--tools" && w[1].is_empty()));
        assert!(args.windows(2).any(|w| w[0] == "--resume" && w[1] == "abc"));
        assert!(args.windows(2).any(|w| w[0] == "--effort" && w[1] == "high"));
        assert!(args.contains(&"--include-partial-messages".to_string()));
    }

    #[test]
    fn claude_project_chat_enables_read_only_tools() {
        let opts = ChatStreamOpts {
            provider: "anthropic".into(),
            model: None,
            prompt: "hi".into(),
            resume: None,
            effort: None,
            cwd: Some("C:\\work\\app".into()),
            access: None,
        };
        let args = cli_args(CliKind::Claude, &opts);
        assert!(args.windows(2).any(|w| w[0] == "--tools" && w[1] == "Read,Glob,Grep"));
    }

    #[test]
    fn claude_ultracode_maps_to_xhigh_plus_settings_flag() {
        let opts = ChatStreamOpts {
            provider: "anthropic".into(),
            model: Some("claude-fable-5".into()),
            prompt: "hi".into(),
            resume: None,
            effort: Some("ultracode".into()),
            cwd: None,
            access: None,
        };
        let args = cli_args(CliKind::Claude, &opts);
        assert!(args.windows(2).any(|w| w[0] == "--effort" && w[1] == "xhigh"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--settings" && w[1] == r#"{"ultracode":true}"#));
        assert!(!args.contains(&"ultracode".to_string()));
    }

    #[test]
    fn codex_resume_skips_sandbox_flag() {
        let opts = ChatStreamOpts {
            provider: "openai".into(),
            model: None,
            prompt: "hi".into(),
            resume: Some("t1".into()),
            effort: None,
            cwd: None,
            access: None,
        };
        let args = cli_args(CliKind::Codex, &opts);
        assert_eq!(args[0], "exec");
        assert_eq!(args[1], "resume");
        assert_eq!(args[2], "t1");
        assert!(!args.contains(&"--sandbox".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("-"));
    }

    #[test]
    fn codex_fresh_session_is_read_only() {
        let opts = ChatStreamOpts {
            provider: "openai".into(),
            model: Some("gpt-5.4".into()),
            prompt: "hi".into(),
            resume: None,
            effort: Some("high".into()),
            cwd: None,
            access: None,
        };
        let args = cli_args(CliKind::Codex, &opts);
        assert!(args.windows(2).any(|w| w[0] == "--sandbox" && w[1] == "read-only"));
        assert!(args.contains(&"model_reasoning_effort=high".to_string()));
    }

    #[test]
    fn claude_full_access_drops_tool_limits_and_bypasses_permissions() {
        let opts = ChatStreamOpts {
            provider: "anthropic".into(),
            model: None,
            prompt: "hi".into(),
            resume: None,
            effort: None,
            cwd: Some("C:\\work\\app".into()),
            access: Some("full".into()),
        };
        let args = cli_args(CliKind::Claude, &opts);
        assert!(!args.contains(&"--tools".to_string()));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--permission-mode" && w[1] == "bypassPermissions"));
    }

    #[test]
    fn codex_full_access_uses_workspace_write_sandbox() {
        let opts = ChatStreamOpts {
            provider: "openai".into(),
            model: None,
            prompt: "hi".into(),
            resume: None,
            effort: None,
            cwd: Some("C:\\work\\app".into()),
            access: Some("full".into()),
        };
        let args = cli_args(CliKind::Codex, &opts);
        assert!(args.windows(2).any(|w| w[0] == "--sandbox" && w[1] == "workspace-write"));
    }

    #[test]
    fn explicit_read_access_outside_project_still_gets_read_tools() {
        let opts = ChatStreamOpts {
            provider: "anthropic".into(),
            model: None,
            prompt: "hi".into(),
            resume: None,
            effort: None,
            cwd: None,
            access: Some("read".into()),
        };
        let args = cli_args(CliKind::Claude, &opts);
        assert!(args.windows(2).any(|w| w[0] == "--tools" && w[1] == "Read,Glob,Grep"));
    }

    fn label_detail(action: &ChatAction) -> (String, String) {
        (action.label.clone(), action.detail.clone())
    }

    #[test]
    fn claude_tool_actions_map_to_verb_and_target() {
        let read = serde_json::json!({ "file_path": "C:\\work\\app\\src\\lib\\bindings.ts" });
        assert_eq!(
            label_detail(&claude_tool_action("Read", &read)),
            ("Read".into(), "lib/bindings.ts".into())
        );
        let bash = serde_json::json!({ "command": "npx tsc --noEmit\nrm -rf x" });
        assert_eq!(
            label_detail(&claude_tool_action("Bash", &bash)),
            ("Ran".into(), "npx tsc --noEmit".into())
        );
        let grep = serde_json::json!({ "pattern": "fn main" });
        assert_eq!(
            label_detail(&claude_tool_action("Grep", &grep)),
            ("Searched".into(), "fn main".into())
        );
        assert_eq!(
            label_detail(&claude_tool_action("SomethingNew", &Value::Null)),
            ("Used".into(), "SomethingNew".into())
        );
    }

    #[test]
    fn claude_task_and_todo_and_mcp_actions() {
        let task = serde_json::json!({ "description": "Find callers", "subagent_type": "explore" });
        assert_eq!(
            label_detail(&claude_tool_action("Task", &task)),
            ("Spawned agent".into(), "explore — Find callers".into())
        );

        let todo = serde_json::json!({ "todos": [
            { "content": "do a", "status": "completed", "activeForm": "doing a" },
            { "content": "do b", "status": "in_progress", "activeForm": "doing b" },
        ]});
        let action = claude_tool_action("TodoWrite", &todo);
        assert_eq!(action.label, "Updated plan");
        let todos = action.todos.expect("plan snapshot");
        assert_eq!(todos.len(), 2);
        assert_eq!(todos[0].content, "do a");
        assert_eq!(todos[1].status, "in_progress");

        assert_eq!(
            label_detail(&claude_tool_action("mcp__github__create_issue", &Value::Null)),
            ("Used".into(), "github · create_issue".into())
        );
        assert_eq!(
            label_detail(&claude_tool_action("Skill", &serde_json::json!({ "skill": "review" }))),
            ("Ran skill".into(), "review".into())
        );
    }

    #[test]
    fn tool_result_text_flattens_blocks_and_clips() {
        assert_eq!(tool_result_text(&serde_json::json!("ok")).as_deref(), Some("ok"));
        let blocks = serde_json::json!([
            { "type": "text", "text": "line one" },
            { "type": "text", "text": "line two" },
        ]);
        assert_eq!(tool_result_text(&blocks).as_deref(), Some("line one\nline two"));
        assert_eq!(tool_result_text(&serde_json::json!("")), None);
        assert_eq!(tool_result_text(&Value::Null), None);
        let long = "x\n".repeat(20);
        let clipped = tool_result_text(&serde_json::json!(long)).unwrap();
        assert!(clipped.ends_with('…'));
        assert_eq!(clipped.lines().count(), 9); // 8 kept + ellipsis line
    }

    #[test]
    fn codex_item_actions_cover_commands_and_patches() {
        let cmd = serde_json::json!({ "command": "cargo check" });
        assert_eq!(
            codex_item_action(Some("command_execution"), &cmd),
            Some(("Ran".into(), "cargo check".into()))
        );
        let patch = serde_json::json!({ "changes": [{ "path": "src/a.rs" }, { "path": "src/b.rs" }] });
        assert_eq!(
            codex_item_action(Some("file_change"), &patch),
            Some(("Edited".into(), "src/a.rs, src/b.rs".into()))
        );
        assert_eq!(codex_item_action(Some("agent_message"), &Value::Null), None);
        assert_eq!(codex_item_action(None, &Value::Null), None);
    }

    #[test]
    fn clip_and_short_path_behave() {
        assert_eq!(clip("  one line  ", 20), "one line");
        assert_eq!(clip("abcdef", 3), "abc…");
        assert_eq!(short_path("a/b/c/d.ts"), "c/d.ts");
        assert_eq!(short_path("solo.rs"), "solo.rs");
    }

    #[test]
    fn chat_msg_wire_format_is_camel_case() {
        let usage = serde_json::to_value(ChatMsg::Usage {
            input_tokens: Some(1),
            output_tokens: Some(2),
        })
        .unwrap();
        assert_eq!(usage["kind"], "usage");
        assert_eq!(usage["inputTokens"], 1, "fields must reach the frontend camelCased: {usage}");

        let update = serde_json::to_value(ChatMsg::ActionUpdate {
            id: "tu_1".into(),
            status: "ok".into(),
            output: None,
        })
        .unwrap();
        assert_eq!(update["kind"], "actionUpdate");

        let action = serde_json::to_value(ChatMsg::Action {
            action: ChatAction {
                label: "Read".into(),
                detail: "a.rs".into(),
                parent_id: Some("tu_0".into()),
                ..Default::default()
            },
        })
        .unwrap();
        assert_eq!(action["action"]["parentId"], "tu_0");
    }

    #[test]
    fn snapshot_delta_forwards_only_new_text() {
        let mut sent = 0;
        assert_eq!(snapshot_delta("hel", &mut sent).as_deref(), Some("hel"));
        assert_eq!(snapshot_delta("hello", &mut sent).as_deref(), Some("lo"));
        assert_eq!(snapshot_delta("hello", &mut sent), None);
        // Rewritten shorter snapshot starts over.
        assert_eq!(snapshot_delta("hey", &mut sent).as_deref(), Some("hey"));
    }
}
