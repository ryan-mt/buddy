// Edit dialog for a chat project: rename it and set the optional instructions
// injected at the start of every conversation inside it. The folder itself is
// picked when the project is added; it's shown here read-only.

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconClose, IconFolder } from "../icons";
import { useChat } from "../../store/chat";
import type { ChatProject } from "../../lib/bindings";

interface ProjectDialogProps {
  project: ChatProject | null;
  onClose: () => void;
}

export function ProjectDialog({ project, onClose }: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");

  // Seed the fields each time the dialog opens.
  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setInstructions(project.instructions);
  }, [project]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || !project) return;
    void useChat.getState().updateProject(project.id, { name: trimmed, instructions });
    onClose();
  };

  return (
    <Dialog.Root open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--glass-border)] p-5 animate-[popIn_180ms_var(--ease-natural)]">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-semibold">Project settings</Dialog.Title>
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
              submit();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] outline-none transition focus:border-[var(--color-accent)]"
            />
            {project?.path && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-2.5 py-2">
                <span className="shrink-0 text-[var(--color-accent)]">
                  <IconFolder size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-text-muted)]" title={project.path}>
                  {project.path}
                </span>
              </div>
            )}
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="Instructions (optional) — e.g. “Answer in Vietnamese, keep replies short.”"
              className="mt-2 w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[12.5px] leading-relaxed outline-none transition focus:border-[var(--color-accent)]"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
              Chats here start with these instructions{project?.path ? " and run inside the project folder" : ""}.
            </p>
            <button
              type="submit"
              disabled={!name.trim()}
              className="mt-3 w-full rounded-xl bg-[var(--color-accent)] py-2 text-[12.5px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:opacity-40"
            >
              Save project
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
