import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { IconClose, IconSearch, IconSpinner } from "../icons";
import { api, Channel, type CliKind, type TerminalMsg } from "../../lib/bindings";
import { AGENT_LABEL } from "../../lib/agents";
import type { CursorStyle } from "../../lib/settings";
import "@xterm/xterm/css/xterm.css";

/** The deep warm well behind every terminal (TUIs render best on dark, in both
 *  app themes). Must match `--color-term-well` in index.css. */
export const TERM_WELL = "#12100c";

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Highlight every match in the scrollback; warm ambers sit on the dark well.
 *  Passing decorations is also what makes the addon report match counts. */
const FIND_DECORATIONS = {
  matchBackground: "#4a3a18",
  matchOverviewRuler: "#8a6c2f",
  activeMatchBackground: "#7a5c1e",
  activeMatchColorOverviewRuler: "#e0a84e",
};

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

interface TerminalProps {
  cli: CliKind;
  cwd?: string | null;
  model?: string | null;
  permissionMode?: string | null;
  effort?: string | null;
  profileId?: string | null;
  title?: string | null;
  /** Reopen a prior session id (Claude resume) instead of starting fresh. */
  resumeId?: string | null;
  /** xterm font size in px (defaults to 13). Applies live. */
  fontSize?: number;
  /** Cursor shape (defaults to block). Applies live. */
  cursorStyle?: CursorStyle;
  /** Cursor blink (defaults to true). Applies live. */
  cursorBlink?: boolean;
  /** Scrollback buffer in lines (defaults to 5000). Applies live. */
  scrollback?: number;
  /** Selecting text copies it to the clipboard. */
  copyOnSelect?: boolean;
  /** Show the find-in-scrollback bar. */
  searchOpen?: boolean;
  onCloseSearch?: () => void;
  onExit?: (code: number | null) => void;
  /** The backend PTY session is live; its id is what Claude can later resume. */
  onReady?: (ptyId: string) => void;
  /** Called on every output chunk with its byte count — drives the live
   *  activity status and the Pulse heartbeat. */
  onOutput?: (bytes: number) => void;
  /** The program rang the terminal bell (BEL). */
  onBell?: () => void;
  /** Return true to swallow a keystroke that was handled elsewhere (broadcast). */
  interceptData?: (data: string) => boolean;
  /** Receives a plain-text scrollback reader on mount, null on dispose. */
  registerScrollback?: (read: (() => string) | null) => void;
  /** Receives a cheap last-N-lines reader on mount, null on dispose. */
  registerTail?: (read: ((maxLines: number) => string) | null) => void;
  /** Override how the PTY session is started (defaults to launching `cli`).
   *  Used by the installer to run an install command in the same machinery. */
  start?: (channel: Channel<TerminalMsg>, rows: number, cols: number) => Promise<string>;
  /** Overlay text shown until the first byte arrives (defaults to "Launching …"). */
  bootingLabel?: string;
}

/**
 * An xterm.js terminal bound to a backend PTY session for its whole lifetime.
 * A "Launching" overlay covers the blank terminal until the first byte arrives,
 * so spawning a CLI feels responsive even while it initializes.
 */
export function Terminal({
  cli,
  cwd,
  model,
  permissionMode,
  effort,
  profileId,
  title,
  resumeId,
  fontSize = 13,
  cursorStyle = "block",
  cursorBlink = true,
  scrollback = 5000,
  copyOnSelect = false,
  searchOpen = false,
  onCloseSearch,
  onExit,
  onReady,
  onOutput,
  onBell,
  interceptData,
  registerScrollback,
  registerTail,
  start,
  bootingLabel,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [booting, setBooting] = useState(true);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ index: number; count: number } | null>(null);

  // Read live inside the selection handler so toggling the setting applies
  // without rebinding (the mount effect runs once).
  const copyOnSelectRef = useRef(copyOnSelect);
  copyOnSelectRef.current = copyOnSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink,
      cursorStyle,
      scrollback,
      fontFamily: '"IBM Plex Mono", "Cascadia Code", Menlo, Consolas, monospace',
      fontSize,
      theme: { background: TERM_WELL, foreground: "#ece5d8" },
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(container);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL unavailable; xterm falls back to its DOM renderer.
    }
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    // Fires on every decorated find — drives the "n/total" readout.
    const results = search.onDidChangeResults(({ resultIndex, resultCount }) =>
      setMatches({ index: resultIndex, count: resultCount }),
    );

    registerScrollback?.(() => {
      const buf = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buf.length; i++) {
        lines.push(buf.getLine(i)?.translateToString(true) ?? "");
      }
      while (lines.length && lines[lines.length - 1] === "") lines.pop();
      return lines.join("\n");
    });

    // Only walks the buffer's tail (skipping the blank viewport rows below the
    // cursor), so polling it every second stays cheap even with big scrollback.
    registerTail?.((maxLines) => {
      const buf = term.buffer.active;
      let end = buf.length;
      let scanned = 0;
      while (
        end > 0 &&
        scanned++ < 500 &&
        (buf.getLine(end - 1)?.translateToString(true) ?? "") === ""
      ) {
        end--;
      }
      const lines: string[] = [];
      for (let i = Math.max(0, end - maxLines); i < end; i++) {
        lines.push(buf.getLine(i)?.translateToString(true) ?? "");
      }
      return lines.join("\n");
    });

    let sessionId: string | null = null;
    let disposed = false;
    let booted = false;

    const channel = new Channel<TerminalMsg>();
    channel.onmessage = (msg) => {
      if (msg.kind === "output") {
        if (!booted) {
          booted = true;
          setBooting(false);
        }
        const bytes = decodeBase64(msg.data);
        if (onBell && bytes.includes(7)) onBell();
        onOutput?.(bytes.length);
        term.write(bytes);
      } else {
        onExit?.(msg.code);
      }
    };

    // Wait until the container has a real size before fitting and spawning, so
    // the PTY starts at the correct column count, then push the size again once
    // the session is live (the split layout may have settled in the meantime).
    // Without this, a terminal mounted into a freshly-measured pane can start at
    // a tiny width and stay there.
    let rafId = 0;
    const startWhenSized = () => {
      if (disposed) return;
      const rect = container.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        rafId = requestAnimationFrame(startWhenSized);
        return;
      }
      try {
        fit.fit();
      } catch {
        // proposeDimensions can momentarily fail; the ResizeObserver retries.
      }
      (start
        ? start(channel, term.rows, term.cols)
        : api.startTerminal(
            {
              cli,
              cwd,
              model,
              permissionMode,
              effort,
              profileId,
              title,
              resumeId,
              rows: term.rows,
              cols: term.cols,
            },
            channel,
          )
      )
        .then((id) => {
          if (disposed) {
            void api.killTerminal(id);
            return;
          }
          sessionId = id;
          sessionRef.current = id;
          onReady?.(id);
          try {
            fit.fit();
          } catch {
            // ignore
          }
          void api.resizeTerminal(id, term.rows, term.cols);
        })
        .catch((e: unknown) => {
          setBooting(false);
          term.write(`\r\n\x1b[31m[buddy] failed to start session: ${errorMessage(e)}\x1b[0m\r\n`);
        });
    };
    // Spawn immediately when the pane already has a size (the common case) so
    // the CLI starts booting without waiting a frame; otherwise poll for size.
    startWhenSized();

    const dataSub = term.onData((data) => {
      if (interceptData?.(data)) return;
      if (sessionId) void api.writeTerminal(sessionId, data);
    });

    const selectSub = term.onSelectionChange(() => {
      if (!copyOnSelectRef.current) return;
      const selection = term.getSelection();
      if (selection) navigator.clipboard.writeText(selection).catch(() => {});
    });

    // Right-click pastes (standard terminal behavior). term.paste() goes
    // through onData above, so broadcast/auto-title interception still applies.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text) term.paste(text);
        })
        .catch(() => {});
    };
    container.addEventListener("contextmenu", onContextMenu);

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (sessionId) void api.resizeTerminal(sessionId, term.rows, term.cols);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      container.removeEventListener("contextmenu", onContextMenu);
      dataSub.dispose();
      selectSub.dispose();
      results.dispose();
      registerScrollback?.(null);
      registerTail?.(null);
      if (sessionId) void api.killTerminal(sessionId).catch(() => {});
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      sessionRef.current = null;
    };
    // Set up once per mount; props are captured intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply font-size changes to the live terminal (not just new sessions).
  useEffect(() => {
    const term = termRef.current;
    if (!term || term.options.fontSize === fontSize) return;
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
    } catch {
      return;
    }
    const id = sessionRef.current;
    if (id) void api.resizeTerminal(id, term.rows, term.cols);
  }, [fontSize]);

  // Cursor and scrollback changes apply live too (no resize needed).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (term.options.cursorStyle !== cursorStyle) term.options.cursorStyle = cursorStyle;
    if (term.options.cursorBlink !== cursorBlink) term.options.cursorBlink = cursorBlink;
    if (term.options.scrollback !== scrollback) term.options.scrollback = scrollback;
  }, [cursorStyle, cursorBlink, scrollback]);

  // Focus the search box when the bar opens; return focus to the terminal on close.
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    } else {
      searchRef.current?.clearDecorations();
      setMatches(null);
      termRef.current?.focus();
    }
  }, [searchOpen]);

  const find = (dir: "next" | "prev") => {
    const search = searchRef.current;
    if (!search || !query) return;
    if (dir === "next") search.findNext(query, { decorations: FIND_DECORATIONS });
    else search.findPrevious(query, { decorations: FIND_DECORATIONS });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      {searchOpen && (
        <div
          className="absolute inset-0 z-10 flex items-start justify-center bg-black/25 pt-12"
          onMouseDown={(e) => {
            // Backdrop click closes; clicks inside the panel don't bubble here.
            if (e.target === e.currentTarget) onCloseSearch?.();
          }}
        >
          <div className="glass-strong flex w-[min(460px,calc(100%-32px))] items-center gap-1.5 rounded-2xl border border-[var(--glass-border)] py-1.5 pl-3 pr-1.5 shadow-[var(--shadow-pop)]">
            <span className="shrink-0 text-[var(--color-text-faint)]">
              <IconSearch size={14} />
            </span>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) {
                  searchRef.current?.findNext(e.target.value, {
                    incremental: true,
                    decorations: FIND_DECORATIONS,
                  });
                } else {
                  searchRef.current?.clearDecorations();
                  setMatches(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") find(e.shiftKey ? "prev" : "next");
                else if (e.key === "Escape") onCloseSearch?.();
                e.stopPropagation();
              }}
              placeholder="Find in scrollback…"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
            />
            {query && matches && (
              <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-faint)]">
                {matches.count > 0 ? `${matches.index + 1}/${matches.count}` : "0/0"}
              </span>
            )}
            <button
              type="button"
              onClick={() => find("prev")}
              title="Previous match (Shift+Enter)"
              className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 14l6-6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => find("next")}
              title="Next match (Enter)"
              className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 10l6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onCloseSearch?.()}
              title="Close (Esc)"
              className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <IconClose size={13} />
            </button>
          </div>
        </div>
      )}
      {booting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-[var(--color-term-well)] text-[13px] text-[var(--color-text-muted)]">
          <IconSpinner size={16} className="animate-spin" />
          {bootingLabel ?? `Launching ${AGENT_LABEL[cli]}…`}
        </div>
      )}
    </div>
  );
}
