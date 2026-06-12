// The chat surface: a centered "ask" hero for fresh threads, a streaming
// conversation column once messages exist. Covers the pane grid while open;
// terminal sessions keep running underneath.

import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "./ChatComposer";
import { ChatHero } from "./ChatHero";
import { ChatMessageRow } from "./ChatMessage";
import { useChat } from "../../store/chat";

export default function ChatView() {
  const thread = useChat((s) => s.thread);
  const streaming = useChat((s) => s.streaming);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Follow the stream only while the user is parked near the bottom. */
  const stickRef = useRef(true);

  useEffect(() => {
    void useChat.getState().init();
  }, []);

  const messages = thread?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });

  return (
    <div className="atmosphere grain flex h-full flex-col bg-[var(--color-bg)]">
      {messages.length === 0 ? (
        <ChatHero draft={draft} setDraft={setDraft} inputRef={inputRef} />
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            }}
            className="relative flex-1 overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
              {messages.map((m, i) => (
                <ChatMessageRow
                  key={m.id}
                  message={m}
                  streaming={streaming && i === messages.length - 1}
                />
              ))}
            </div>
          </div>
          <div className="relative px-6 pb-5 pt-1">
            <div className="mx-auto w-full max-w-3xl">
              <ChatComposer draft={draft} setDraft={setDraft} inputRef={inputRef} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
