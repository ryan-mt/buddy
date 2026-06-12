// Fresh-thread hero: logo, a quiet headline, the composer, and a few pebble
// chips that seed the draft (they fill the box rather than firing immediately).

import type { RefObject } from "react";
import { Logo } from "../Logo";
import { IconClose, IconFolder } from "../icons";
import { ChatComposer } from "./ChatComposer";
import { useChat } from "../../store/chat";

const SUGGESTIONS = [
  {
    label: "Untangle an error",
    seed: "Here's a stack trace — find the likely root cause and the smallest safe fix:\n\n",
  },
  {
    label: "Sharpen a prompt",
    seed: "Rewrite this into a precise prompt for a coding agent: ",
  },
  {
    label: "Weigh two paths",
    seed: "Compare these two approaches and recommend one, with tradeoffs: ",
  },
];

interface ChatHeroProps {
  draft: string;
  setDraft: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatHero({ draft, setDraft, inputRef }: ChatHeroProps) {
  const activeProjectId = useChat((s) => s.activeProjectId);
  const projects = useChat((s) => s.projects);
  const setActiveProject = useChat((s) => s.setActiveProject);
  const project = projects.find((p) => p.id === activeProjectId);

  // Project chats can read the folder — lead with a code-aware starter.
  const suggestions = project?.path
    ? [
        {
          label: "Tour this codebase",
          seed: "Give me a tour of this codebase: entry points, how the pieces fit, and where to start reading.",
        },
        ...SUGGESTIONS.slice(0, 2),
      ]
    : SUGGESTIONS;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8">
      <Logo size={44} />
      <div className="text-center">
        <h1 className="text-[21px] font-semibold tracking-tight">
          Ask <span className="text-[var(--color-accent)]">buddy</span> anything
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">
          Runs on your Claude Code &amp; Codex logins — no API keys.
        </p>
        {project && (
          <span className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-[12px] text-[var(--color-text-muted)]">
            <span className="text-[var(--color-accent)]">
              <IconFolder size={12} />
            </span>
            <span className="font-medium text-[var(--color-text)]">{project.name}</span>
            {project.path && (
              <span className="max-w-[220px] truncate font-mono text-[10.5px]" title={project.path}>
                {project.path}
              </span>
            )}
            {project.instructions.trim() && <span>· instructions apply</span>}
            <button
              type="button"
              title="Start outside this project"
              onClick={() => setActiveProject(null)}
              className="ml-0.5 rounded p-0.5 text-[var(--color-text-faint)] transition hover:text-[var(--color-text)]"
            >
              <IconClose size={11} />
            </button>
          </span>
        )}
      </div>
      <div className="w-full max-w-2xl">
        <ChatComposer draft={draft} setDraft={setDraft} inputRef={inputRef} />
      </div>
      <div className="flex max-w-2xl flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setDraft(s.seed);
              inputRef.current?.focus();
            }}
            className="glass rounded-full border border-[var(--glass-border)] px-3.5 py-1.5 text-[12px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
