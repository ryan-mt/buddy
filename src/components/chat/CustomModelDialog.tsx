// Free-text model id entry — the escape hatch for models that ship after the
// built-in catalog. The id is handed to the CLI verbatim (--model / -m).

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconClose } from "../icons";
import { PROVIDER_LABEL } from "../../lib/chatModels";
import { useChat } from "../../store/chat";
import type { ChatProvider } from "../../lib/bindings";

interface CustomModelDialogProps {
  provider: ChatProvider | null;
  onClose: () => void;
}

export function CustomModelDialog({ provider, onClose }: CustomModelDialogProps) {
  const [value, setValue] = useState("");
  const setModel = useChat((s) => s.setModel);

  return (
    <Dialog.Root open={provider !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--glass-border)] p-5 animate-[popIn_180ms_var(--ease-natural)]">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-semibold">
              Custom {provider ? PROVIDER_LABEL[provider] : ""} model
            </Dialog.Title>
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
              const id = value.trim();
              if (provider && id) {
                setModel(provider, id);
                onClose();
              }
            }}
          >
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={provider === "openai" ? "e.g. gpt-5.5-pro" : "e.g. claude-opus-4-7"}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 font-mono text-[12.5px] outline-none transition focus:border-[var(--color-accent)]"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
              Passed to the CLI verbatim as its model flag.
            </p>
            <button
              type="submit"
              disabled={!value.trim()}
              className="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-2 text-[12.5px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:opacity-40"
            >
              Use model
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
