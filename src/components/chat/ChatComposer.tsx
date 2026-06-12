// The prompt box: auto-growing textarea, model + effort switchers, and a
// send button that flips into a stop button while a reply streams in.
// Replies run through the local agent CLIs, so there's nothing to configure
// here — if a CLI is missing, a quiet note says so.

import { useCallback, useRef, type RefObject } from "react";
import { IconArrowUp, IconStop } from "../icons";
import { AccessPicker } from "./AccessPicker";
import { EffortPicker } from "./EffortPicker";
import { ModelPicker } from "./ModelPicker";
import { PROVIDER_LABEL, supportsEffort } from "../../lib/chatModels";
import { splitLinkTokens } from "../../lib/linkChips";
import { useApp } from "../../store";
import { useChat } from "../../store/chat";

const CLI_FOR = { anthropic: "claude", openai: "codex" } as const;

interface ChatComposerProps {
  draft: string;
  setDraft: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatComposer({ draft, setDraft, inputRef }: ChatComposerProps) {
  const streaming = useChat((s) => s.streaming);
  const provider = useChat((s) => s.provider);
  const model = useChat((s) => s.model);
  const clis = useApp((s) => s.clis);

  const cli = clis.find((c) => c.kind === CLI_FOR[provider]);
  const missing = cli ? !cli.available : false;

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    const el = inputRef.current;
    if (el) el.style.height = "auto";
    void useChat.getState().send(text);
  }, [draft, streaming, setDraft, inputRef]);

  // Pasted/typed links get a live accent highlight: a metrics-identical
  // overlay renders the draft underneath the (transparent-text) textarea, so
  // the caret, selection, and IME all stay native.
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const syncOverlayScroll = useCallback(() => {
    const el = inputRef.current;
    const overlay = overlayRef.current;
    if (el && overlay) overlay.scrollTop = el.scrollTop;
  }, [inputRef]);

  return (
    <div className="glass-strong rounded-[26px] border border-[var(--glass-border)] px-4 py-3 shadow-[var(--shadow-pop)]">
      <div className="relative">
        <div
          ref={overlayRef}
          aria-hidden
          className="composer-overlay absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words px-1 text-[13.5px] leading-relaxed"
        >
          {splitLinkTokens(draft).map((t, i) =>
            t.kind === "link" ? (
              <span key={i} className="composer-link">
                {t.text}
              </span>
            ) : (
              t.text
            ),
          )}
          {"\u200b"}
        </div>
        <textarea
          ref={inputRef}
          rows={2}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.currentTarget.style.height = "auto";
            e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 190)}px`;
            requestAnimationFrame(syncOverlayScroll);
          }}
          onScroll={syncOverlayScroll}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything — Enter sends, Shift+Enter for a new line"
          className="relative z-10 w-full resize-none bg-transparent px-1 text-[13.5px] leading-relaxed text-transparent caret-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>
      <div className="flex items-center gap-1.5 pt-1.5">
        <ModelPicker />
        {supportsEffort(provider, model) && <EffortPicker />}
        <AccessPicker />
        <span className="flex-1" />
        {missing && (
          <span className="px-2 py-1 text-[11.5px] text-[var(--color-warning)]">
            {PROVIDER_LABEL[provider]} isn't installed
          </span>
        )}
        {streaming ? (
          <button
            type="button"
            onClick={() => useChat.getState().stop()}
            title="Stop generating"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-danger)] text-white shadow-[var(--shadow-pop)] transition hover:brightness-110"
          >
            <IconStop size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            title="Send (Enter)"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
          >
            <IconArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
