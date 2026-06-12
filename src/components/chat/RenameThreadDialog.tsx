// Rename dialog for a chat thread (auto titles come from the first prompt and
// are rarely what you'd file the thread under).

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconClose } from "../icons";
import { useChat } from "../../store/chat";
import type { ChatMeta } from "../../lib/bindings";

interface RenameThreadDialogProps {
  meta: ChatMeta | null;
  onClose: () => void;
}

export function RenameThreadDialog({ meta, onClose }: RenameThreadDialogProps) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (meta) setTitle(meta.title);
  }, [meta]);

  return (
    <Dialog.Root open={meta !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--glass-border)] p-5 animate-[popIn_180ms_var(--ease-natural)]">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-semibold">Rename chat</Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <IconClose size={15} />
            </Dialog.Close>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const next = title.trim();
              if (meta && next) {
                void useChat.getState().renameThread(meta.id, next);
                onClose();
              }
            }}
          >
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] outline-none transition focus:border-[var(--color-accent)]"
            />
            <button
              type="submit"
              disabled={!title.trim()}
              className="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-2 text-[12.5px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:opacity-40"
            >
              Rename
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
