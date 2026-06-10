import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { IconSpinner } from "../icons";
import { api, Channel, type CliKind, type TerminalMsg } from "../../lib/bindings";
import { AGENT_LABEL } from "../../lib/agents";
import "@xterm/xterm/css/xterm.css";

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
  /** xterm font size in px (defaults to 13). */
  fontSize?: number;
  onExit?: (code: number | null) => void;
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
  onExit,
  start,
  bootingLabel,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", "Cascadia Code", Menlo, Consolas, monospace',
      fontSize,
      theme: { background: "#0a0a0b", foreground: "#e6e6ea" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL unavailable; xterm falls back to its DOM renderer.
    }
    fit.fit();

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
        term.write(decodeBase64(msg.data));
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
      if (sessionId) void api.killTerminal(sessionId).catch(() => {});
      term.dispose();
    };
    // Set up once per mount; props are captured intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full overflow-hidden" />
      {booting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-[#0a0a0b] text-[13px] text-[var(--color-text-muted)]">
          <IconSpinner size={16} className="animate-spin" />
          {bootingLabel ?? `Launching ${AGENT_LABEL[cli]}…`}
        </div>
      )}
    </div>
  );
}
