# buddy

A desktop app to run and manage many AI agent CLI sessions side by side —
Claude Code, Codex, Gemini, opencode, and Grok — in embedded interactive
terminals, with projects, isolated account profiles, split layouts, a code
editor, and session history.

Built with **Tauri 2** (Rust backend) + **React 19 / TypeScript / Vite**, with
real PTY terminals via `portable-pty` (ConPTY on Windows) rendered with
`xterm.js`.

## Features

- **Multi-CLI sessions.** Auto-detects installed CLIs and launches each in a
  real interactive terminal. An adaptive *New Session* dialog exposes the
  model / permission / effort controls each CLI actually supports.
- **In-app installer.** Install any supported CLI with the vendor's official
  per-OS command, streamed in a terminal; detects missing Node and guides you.
- **Projects.** Add folders to launch sessions in (cwd) or open in the editor.
- **Profiles (multiple accounts).** Each profile owns an isolated config
  directory, so you can log in to separate Claude / Codex accounts and run them
  at the same time, with optional default model / base-URL overrides.
- **Splits & zoom.** Tile sessions into flexible split panes; drag dividers to
  resize, or zoom one pane full-size (`Ctrl/Cmd+Shift+Z`). Terminals stay
  mounted (PTY-safe) and are just repositioned.
- **Find in terminal.** Search the scrollback of any session
  (`Ctrl/Cmd+Shift+F`, Enter / Shift+Enter to step through matches).
- **Session care.** Rename sessions in place (double-click the title), and a
  confirmation guards closing a session that's still running. Failed actions
  surface as toasts instead of failing silently.
- **Code editor.** Monaco-based editor with a lazy file tree, tabs, dirty
  tracking, and save (bundled fully offline).
- **History & resume.** Every session is recorded; resume past Claude sessions
  (`--resume`) either from buddy's history or from what's on disk in
  `~/.claude`. Read past transcripts in a viewer with token totals.
- **Settings & shortcuts.** Light / dark theme, terminal font size, default
  Claude permission / effort. Global shortcuts: `Ctrl/Cmd+Shift+T` new session,
  `+W` close, `+F` find, `+Z` zoom pane, `+1…9` switch, `+,` settings.
- **Liquid-glass UI.** Warm, organic palette with frosted-glass chrome
  (sidebar, header, dialogs) over an ambient color mesh; live sessions breathe.

## Develop

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build      # release binary + OS installer
```

## Checks

```bash
npm run build                       # tsc + vite build
cargo test    --manifest-path src-tauri/Cargo.toml
cargo clippy  --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Notes

- **Profiles use up-to-date isolation env vars** — Claude `CLAUDE_CONFIG_DIR`,
  Codex `CODEX_HOME`. The other CLIs expose no documented config-dir env var, so
  a profile applies no overrides for them rather than guessing one.
- **Resume + profiles caveat.** Claude's `--resume` currently reads only
  `~/.claude/projects/` and ignores `CLAUDE_CONFIG_DIR`
  ([claude-code#16103](https://github.com/anthropics/claude-code/issues/16103)),
  so resuming a *profile-bound* Claude session may not find its transcript.
  Default (no-profile) sessions resume normally, and the transcript **viewer**
  works for every session regardless of profile.
- **Models use official aliases** (opus/sonnet/haiku, pro/flash/…) that resolve
  to the latest real model, plus a free-text *Custom…* field — no version
  numbers are hard-coded.
