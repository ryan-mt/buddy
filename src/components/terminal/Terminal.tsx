import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { IconClose, IconSpinner } from "../icons";
import { api, Channel, type CliKind, type TerminalMsg } from "../../lib/bindings";
import { AGENT_LABEL } from "../../lib/agents";
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
  /** Show the find-in-scrollback bar. */
  searchOpen?: boolean;
  onCloseSearch?: () => void;
  onExit?: (code: number | null) => void;
  /** The backend PTY session is live; its id is what Claude can later resume. */
  onReady?: (ptyId: string) => void;
  /** Called on every output chunk — drives the live activity status. */
  onOutput?: () => void;
  /** The program rang the terminal bell (BEL). */
  onBell?: () => void;
  /** Return true to swallow a keystroke that was handled elsewhere (broadcast). */
  interceptData?: (data: string) => boolean;
  /** Receives a plain-text scrollback reader on mount, null on dispose. */
  registerScrollback?: (read: (() => string) | null) => void;
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
  searchOpen = false,
  onCloseSearch,
  onExit,
  onReady,
  onOutput,
  onBell,
  interceptData,
  registerScrollback,
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: true,
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

    registerScrollback?.(() => {
      const buf = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buf.length; i++) {
        lines.push(buf.getLine(i)?.translateToString(true) ?? "");
      }
      while (lines.length && lines[lines.length - 1] === "") lines.pop();
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
        onOutput?.();
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
      dataSub.dispose();
      registerScrollback?.(null);
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

  // Focus the search box when the bar opens; return focus to the terminal on close.
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    } else {
      searchRef.current?.clearDecorations();
      termRef.current?.focus();
    }
  }, [searchOpen]);

  const find = (dir: "next" | "prev") => {
    const search = searchRef.current;
    if (!search || !query) return;
    if (dir === "next") search.findNext(query);
    else search.findPrevious(query);
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      {searchOpen && (
        <div className="glass-strong absolute right-2 top-2 z-10 flex items-center gap-1 rounded-xl border border-[var(--glass-border)] py-1 pl-2 pr-1">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value) searchRef.current?.findNext(e.target.value, { incremental: true });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") find(e.shiftKey ? "prev" : "next");
              else if (e.key === "Escape") onCloseSearch?.();
              e.stopPropagation();
            }}
            placeholder="Find…"
            className="w-40 bg-transparent font-mono text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
          />
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
