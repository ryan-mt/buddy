import { IconClose } from "./icons";
import { useApp } from "../store";

/** Bottom-right notifications for failed actions (no more silent errors). */
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismissToast = useApp((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass-strong pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 animate-[toastIn_180ms_var(--ease-natural)]"
          style={{
            borderColor: t.kind === "error" ? "var(--color-danger)" : "var(--glass-border)",
          }}
        >
          <span className="min-w-0 flex-1 break-words text-[12px] leading-relaxed text-[var(--color-text)]">
            {t.message}
          </span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="shrink-0 rounded-md p-0.5 text-[var(--color-text-faint)] transition hover:text-[var(--color-text)]"
            aria-label="Dismiss"
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
