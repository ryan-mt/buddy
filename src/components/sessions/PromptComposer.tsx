import { useEffect, useRef, useState } from "react";
import { IconBookmark, IconClose, IconSend } from "../icons";
import { useApp } from "../../store";

/**
 * Slide-up prompt composer (⌃⇧P): write once, send to the active pane or to
 * every visible pane. Busy agents queue the prompt and get it when they go
 * quiet. Snippets persist favourite prompts across sessions.
 */
export function PromptComposer() {
  const open = useApp((s) => s.composerOpen);
  const setOpen = useApp((s) => s.setComposerOpen);
  const layout = useApp((s) => s.layout);
  const snippets = useApp((s) => s.snippets);
  const addSnippet = useApp((s) => s.addSnippet);
  const removeSnippet = useApp((s) => s.removeSnippet);
  const sendPrompt = useApp((s) => s.sendPrompt);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<"active" | "all">("active");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const isSplit = layout?.kind === "split";

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  // A single pane has no "all panes" to speak of.
  useEffect(() => {
    if (!isSplit && target === "all") setTarget("active");
  }, [isSplit, target]);

  if (!open) return null;

  const send = () => {
    if (!text.trim()) return;
    sendPrompt(text, target);
    setText("");
  };

  const targetBtn = (value: "active" | "all", label: string, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setTarget(value)}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        target === value
          ? "bg-[var(--color-surface-3)] text-[var(--color-text)]"
          : "text-[var(--color-text-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="glass-strong fixed bottom-6 left-1/2 z-30 w-[560px] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-[var(--glass-border)] p-3"
      style={{ animation: "popIn 180ms var(--ease-natural)" }}
    >
      {snippets.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {snippets.map((snip) => (
            <span
              key={snip.id}
              className="group flex max-w-[200px] items-center gap-1 rounded-lg bg-[var(--color-surface-2)] py-0.5 pl-2 pr-1 font-mono text-[11px] text-[var(--color-text-muted)]"
            >
              <button
                type="button"
                onClick={() => {
                  setText(snip.text);
                  textRef.current?.focus();
                }}
                title={snip.text}
                className="truncate transition hover:text-[var(--color-text)]"
              >
                {snip.text}
              </button>
              <button
                type="button"
                onClick={() => removeSnippet(snip.id)}
                title="Delete snippet"
                className="rounded p-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:text-[var(--color-danger)] group-hover:opacity-100"
              >
                <IconClose size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
          e.stopPropagation();
        }}
        rows={3}
        placeholder="Write a prompt… (Ctrl+Enter to send, Esc to close)"
        className="w-full resize-none rounded-xl bg-[var(--color-surface)] px-3 py-2 font-mono text-[12.5px] leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
      />

      <div className="mt-2 flex items-center gap-1.5">
        {targetBtn("active", "Active pane")}
        {targetBtn("all", "All panes", !isSplit)}
        <span className="pl-1 text-[10px] text-[var(--color-text-faint)]">
          busy agents queue it
        </span>
        <button
          type="button"
          onClick={() => addSnippet(text)}
          disabled={!text.trim()}
          title="Save as snippet"
          className="ml-auto rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconBookmark size={15} />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconSend size={13} /> Send
        </button>
      </div>
    </div>
  );
}
