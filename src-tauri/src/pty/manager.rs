//! Registry that owns every live PTY session.

use crate::error::{AppError, AppResult};
use crate::pty::session::{PtySession, SpawnSpec, TerminalMsg};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

type Sessions = Arc<Mutex<HashMap<Uuid, Arc<PtySession>>>>;

/// Registry of live PTY sessions, shared across the app.
pub struct SessionManager {
    sessions: Sessions,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn `spec` in a fresh PTY under `id`. Output is streamed through `sink`;
    /// a separate waiter thread reliably detects process exit (ConPTY does not
    /// surface EOF on the reader when the child exits on its own).
    pub fn start<S>(&self, id: Uuid, spec: SpawnSpec, sink: S) -> AppResult<()>
    where
        S: FnMut(TerminalMsg) -> bool + Send + Clone + 'static,
    {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: spec.rows,
                cols: spec.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Pty(e.to_string()))?;

        let mut cmd = CommandBuilder::new(&spec.program);
        for arg in &spec.args {
            cmd.arg(arg);
        }
        if let Some(cwd) = &spec.cwd {
            cmd.cwd(cwd);
        }
        // Inherit the parent environment, then layer per-profile overrides on top.
        for (key, value) in std::env::vars() {
            cmd.env(key, value);
        }
        for (key, value) in &spec.env {
            cmd.env(key, value);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Pty(e.to_string()))?;
        drop(pair.slave);

        let killer = child.clone_killer();
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Pty(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Pty(e.to_string()))?;

        let session = Arc::new(PtySession {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
            killer: Mutex::new(killer),
        });
        self.sessions
            .lock()
            .map_err(|_| AppError::Pty("session registry poisoned".into()))?
            .insert(id, session);

        spawn_reader(reader, sink.clone());
        spawn_waiter(id, child, sink, Arc::clone(&self.sessions));
        Ok(())
    }

    pub fn write(&self, id: Uuid, data: &[u8]) -> AppResult<()> {
        self.get(id)?.write(data)
    }

    pub fn resize(&self, id: Uuid, rows: u16, cols: u16) -> AppResult<()> {
        self.get(id)?.resize(rows, cols)
    }

    pub fn kill(&self, id: Uuid) -> AppResult<()> {
        // Killing makes the waiter observe exit, which removes the session.
        self.get(id)?.kill()
    }

    fn get(&self, id: Uuid) -> AppResult<Arc<PtySession>> {
        self.sessions
            .lock()
            .map_err(|_| AppError::Pty("session registry poisoned".into()))?
            .get(&id)
            .cloned()
            .ok_or(AppError::SessionNotFound(id))
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Blocking read loop, streaming output until the PTY closes.
fn spawn_reader<S>(mut reader: Box<dyn Read + Send>, mut sink: S)
where
    S: FnMut(TerminalMsg) -> bool + Send + 'static,
{
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let msg = TerminalMsg::Output {
                        data: STANDARD.encode(&buf[..n]),
                    };
                    if !sink(msg) {
                        break;
                    }
                }
            }
        }
    });
}

/// Waits for the child to exit, reports it, then closes the PTY by dropping the
/// session (which unblocks the reader).
fn spawn_waiter<S>(
    id: Uuid,
    mut child: Box<dyn Child + Send + Sync>,
    mut sink: S,
    sessions: Sessions,
) where
    S: FnMut(TerminalMsg) -> bool + Send + 'static,
{
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|status| status.exit_code() as i32);
        sink(TerminalMsg::Exit { code });
        if let Ok(mut map) = sessions.lock() {
            map.remove(&id);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    #[test]
    fn spawns_streams_output_and_reports_exit() {
        let manager = SessionManager::new();
        let (tx, rx) = mpsc::channel();
        let id = Uuid::new_v4();

        let spec = if cfg!(windows) {
            SpawnSpec {
                program: "cmd.exe".into(),
                args: vec!["/c".into(), "echo hello-pty".into()],
                cwd: None,
                env: vec![],
                rows: 24,
                cols: 80,
            }
        } else {
            SpawnSpec {
                program: "/bin/sh".into(),
                args: vec!["-c".into(), "echo hello-pty".into()],
                cwd: None,
                env: vec![],
                rows: 24,
                cols: 80,
            }
        };

        manager
            .start(id, spec, move |msg| tx.send(msg).is_ok())
            .expect("session should start");

        let mut output = Vec::new();
        let mut exited = false;
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(TerminalMsg::Output { data }) => {
                    output.extend_from_slice(&STANDARD.decode(data).expect("valid base64"));
                }
                Ok(TerminalMsg::Exit { .. }) => {
                    exited = true;
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }

        assert!(exited, "session should report exit");
        let text = String::from_utf8_lossy(&output);
        assert!(text.contains("hello-pty"), "unexpected output: {text:?}");
    }
}
