//! Child-process transport for chat turns: spawn the agent CLI headless, feed
//! the prompt on stdin, pump its JSONL stdout into `ChatMsg`s, and kill the
//! process on cancel. Per-CLI args and event parsing live in `providers`.

use super::providers::{cli_args, Parser};
use super::{ChatMsg, ChatStreamOpts};
use crate::cli::CliKind;
use crate::error::AppError;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Notify};

/// Drive one turn: spawn the CLI, stream its events until it finishes, the
/// process exits, or `cancel` fires.
pub(crate) async fn run(
    kind: CliKind,
    bin: &Path,
    opts: &ChatStreamOpts,
    cancel: &Notify,
    channel: &Channel<ChatMsg>,
) -> Result<(), AppError> {
    let mut cmd = Command::new(bin);
    cmd.args(cli_args(kind, opts))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Project chats run inside their folder; anything else gets a neutral home
    // cwd so the chat doesn't ingest whatever project buddy was launched from.
    // Session resume is scoped to the cwd it started in, so this must stay
    // stable across the turns of a thread.
    let project_dir = opts
        .cwd
        .as_deref()
        .map(Path::new)
        .filter(|p| p.is_absolute() && p.is_dir());
    if let Some(dir) = project_dir {
        cmd.current_dir(dir);
    } else if let Some(base) = directories::BaseDirs::new() {
        cmd.current_dir(base.home_dir());
    }
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW



    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Other(format!("failed to launch {}: {e}", kind.label())))?;

    // Prompt goes over stdin — no command-line length or quoting limits.
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(opts.prompt.as_bytes()).await;
        let _ = stdin.shutdown().await;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("CLI gave no stdout".into()))?;
    let mut lines = BufReader::new(stdout).lines();

    // Keep a stderr tail for diagnostics — login problems and bad flags show
    // up there, not as structured events.
    let stderr_tail: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    if let Some(stderr) = child.stderr.take() {
        let tail = stderr_tail.clone();
        tauri::async_runtime::spawn(async move {
            let mut err_lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = err_lines.next_line().await {
                let mut tail = tail.lock().await;
                tail.push('\n');
                tail.push_str(&line);
                if tail.len() > 4096 {
                    let mut cut = tail.len() - 4096;
                    while !tail.is_char_boundary(cut) {
                        cut += 1;
                    }
                    tail.drain(..cut);
                }
            }
        });
    }

    let mut parser = Parser::new(kind);
    loop {
        tokio::select! {
            biased;
            _ = cancel.notified() => {
                let _ = child.kill().await;
                let _ = channel.send(ChatMsg::Done { stop_reason: None, cancelled: true });
                return Ok(());
            }
            line = lines.next_line() => match line {
                Ok(Some(line)) => {
                    if parser.handle(&line, channel) {
                        // Terminal event delivered; reap the child off-path.
                        tauri::async_runtime::spawn(async move { let _ = child.wait().await; });
                        return Ok(());
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    let _ = child.kill().await;
                    return Err(AppError::Other(format!("stream error: {e}")));
                }
            },
        }
    }

    // stdout closed without a terminal event — distill the exit into a result.
    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Other(format!("wait failed: {e}")))?;
    if status.success() {
        let _ = channel.send(ChatMsg::Done { stop_reason: None, cancelled: false });
        return Ok(());
    }
    let tail = stderr_tail.lock().await;
    Err(AppError::Other(exit_error(kind, &tail)))
}

/// One readable line from a failed exit: the last few stderr lines usually
/// carry the actual reason (e.g. "Please run /login").
fn exit_error(kind: CliKind, stderr: &str) -> String {
    let mut last: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let keep = last.split_off(last.len().saturating_sub(3));
    if keep.is_empty() {
        format!("{} exited unexpectedly", kind.label())
    } else {
        keep.join(" · ")
    }
}
