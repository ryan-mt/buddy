import * as Dialog from "@radix-ui/react-dialog";
import { useApp } from "../../store";

/** "Really close?" guard for sessions that are still running. */
export function ConfirmCloseDialog() {
  const confirmCloseId = useApp((s) => s.confirmCloseId);
  const session = useApp((s) => s.sessions.find((x) => x.id === s.confirmCloseId) ?? null);
  const closeSession = useApp((s) => s.closeSession);
  const cancelClose = useApp((s) => s.cancelClose);

  return (
    <Dialog.Root
      open={confirmCloseId !== null}
      onOpenChange={(o) => {
        if (!o) cancelClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px] animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--glass-border)] p-5 animate-[popIn_180ms_var(--ease-natural)]">
          <Dialog.Title className="mb-1.5 text-[15px] font-semibold">Close session?</Dialog.Title>
          <Dialog.Description className="mb-4 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text)]">{session?.title}</span> is still
            running. Closing it ends the process.
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                if (confirmCloseId) closeSession(confirmCloseId);
              }}
              className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              Close session
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
