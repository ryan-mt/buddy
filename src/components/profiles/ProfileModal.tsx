import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconClose } from "../icons";
import type { Profile, ProfileInput } from "../../lib/bindings";

/** Identity colors a profile can take (buddy's own palette, not vendor brands). */
export const PROFILE_COLORS = [
  "#d98a6a",
  "#5fb3a6",
  "#e0a458",
  "#9b8cce",
  "#7bb274",
  "#6aa0d9",
  "#cf7fa6",
  "#8a93a6",
];

const labelClass = "mb-1.5 block text-[12px] font-medium text-[var(--color-text-muted)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]";

interface ProfileModalProps {
  open: boolean;
  /** The profile being edited, or null when creating a new one. */
  profile: Profile | null;
  onSave: (input: ProfileInput) => void;
  onClose: () => void;
}

export function ProfileModal({ open, profile, onSave, onClose }: ProfileModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? "");
    setColor(profile?.color ?? PROFILE_COLORS[0]);
    setModel(profile?.model ?? "");
    setBaseUrl(profile?.baseUrl ?? "");
  }, [open, profile]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      color,
      model: model.trim() || null,
      baseUrl: baseUrl.trim() || null,
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[3px] animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[440px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--glass-border)] p-5 animate-[popIn_180ms_var(--ease-natural)]">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-[15px] font-semibold">
              {profile ? "Edit profile" : "New profile"}
            </Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>

          <p className="mb-4 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-text-faint)]">
            A profile keeps its own isolated config dir, so you can log in to a
            separate Claude / Codex account and run them side by side.
          </p>

          <div className="mb-4">
            <label className={labelClass}>Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work, Personal"
              className={fieldClass}
            />
          </div>

          <div className="mb-4">
            <label className={labelClass}>Color</label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className="h-7 w-7 rounded-full transition"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? "2px solid var(--color-text)" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Default model (optional)</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. opus, sonnet, claude-opus-4-8"
              className={`${fieldClass} font-mono`}
            />
          </div>

          <div className="mb-5">
            <label className={labelClass}>Base URL (optional)</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="custom Anthropic-compatible endpoint"
              className={`${fieldClass} font-mono`}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {profile ? "Save" : "Create"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
