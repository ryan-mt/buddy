// One chat turn. User prompts sit right-aligned in a quiet bubble; assistant
// replies run full-width under a provider-tinted avatar, with the model name,
// token usage, a collapsible reasoning trace, and rendered markdown.

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  IconBookmark,
  IconCheck,
  IconClose,
  IconCopy,
  IconDownload,
  IconFile,
  IconPencil,
  IconProfiles,
  IconSearch,
  IconSparkle,
  IconSpinner,
  IconTerminal,
} from "../icons";
import { LinkifiedText } from "./InlineLinkChip";
import { renderMarkdown } from "../../lib/markdown";
import { modelLabel, PROVIDER_COLOR, PROVIDER_LOGO } from "../../lib/chatModels";
import type { ChatAction, ChatMessage, ChatProvider, TodoItem } from "../../lib/bindings";

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Open links in the system browser — never navigate the webview. */
function onLinkClick(e: React.MouseEvent<HTMLDivElement>) {
  const a = (e.target as HTMLElement).closest("a");
  if (a?.href) {
    e.preventDefault();
    void openUrl(a.href);
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy message"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] group-hover:opacity-100"
    >
      <IconCopy size={12} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Tiny verb-matched icon for a timeline row. */
const ACTION_ICON: [RegExp, ComponentType<{ size?: number; className?: string }>][] = [
  [/^(Edited|Wrote)/, IconPencil],
  [/^Read/, IconFile],
  [/^Ran/, IconTerminal],
  [/^(Searched|Globbed)/, IconSearch],
  [/^Fetched/, IconDownload],
  [/^Spawned/, IconProfiles],
  [/^(Updated|Presented|Entered)/, IconBookmark],
];

function actionIcon(label: string) {
  return ACTION_ICON.find(([re]) => re.test(label))?.[1] ?? IconSparkle;
}

/** Live/settled marker for a tool row; legacy rows (no status) show nothing. */
function StatusBadge({ status }: { status?: string | null }) {
  if (status === "running")
    return <IconSpinner size={11} className="shrink-0 animate-spin text-[var(--color-accent)]" />;
  if (status === "error") return <IconClose size={10} className="shrink-0 text-[var(--color-danger)]" />;
  if (status === "ok") return <IconCheck size={11} className="shrink-0 text-[var(--color-text-faint)]" />;
  return null;
}

function TodoStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <IconCheck size={11} className="text-[var(--color-accent)]" />;
  const active = status === "in_progress";
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 24 24"
      aria-hidden
      className={active ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]"}
    >
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {active && <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** The agent's TodoWrite plan, rendered as a quiet checklist card. */
function TodoCard({ todos }: { todos: TodoItem[] }) {
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <div className="my-0.5 max-w-md rounded-xl border border-[var(--glass-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
        <IconBookmark size={11} /> Plan
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-faint)]">
          {done}/{todos.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {todos.map((t, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-[3px] shrink-0">
              <TodoStatusIcon status={t.status} />
            </span>
            <span
              className={`text-[12px] leading-snug ${
                t.status === "completed"
                  ? "text-[var(--color-text-faint)] line-through"
                  : t.status === "in_progress"
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)]"
              }`}
            >
              {t.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One timeline row. Rows with a captured result expand it on click. */
function ActionRow({ action, trailing }: { action: ChatAction; trailing?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Icon = actionIcon(action.label);
  const expandable = !!action.output;
  return (
    <div className="flex min-w-0 flex-col">
      <div
        role={expandable ? "button" : undefined}
        onClick={expandable ? () => setOpen(!open) : undefined}
        title={expandable ? (open ? "Hide result" : "Show result") : undefined}
        className={`flex min-w-0 items-center gap-1.5 ${
          expandable ? "-mx-1 cursor-pointer rounded-md px-1 transition hover:bg-[var(--color-surface-2)]" : ""
        }`}
      >
        <span className="shrink-0 text-[var(--color-text-faint)]">
          <Icon size={12} />
        </span>
        <span className="shrink-0 text-[12px] text-[var(--color-text-faint)]">{action.label}</span>
        {action.detail && (
          <span className="truncate font-mono text-[11.5px] text-[var(--color-text-muted)]">
            {action.detail}
          </span>
        )}
        <StatusBadge status={action.status} />
        {trailing}
      </div>
      {open && action.output && (
        <pre className="my-1 ml-5 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {action.output}
        </pre>
      )}
    </div>
  );
}

/** A Task call with its subagent's own tool calls nested beneath it.
 *  Auto-opens while the subagent is running; collapsible once settled. */
function SubagentGroup({ parent, steps }: { parent: ChatAction; steps: ChatAction[] }) {
  const [open, setOpen] = useState(parent.status === "running");
  useEffect(() => {
    if (parent.status === "running") setOpen(true);
  }, [parent.status]);
  return (
    <div className="flex flex-col gap-1">
      <ActionRow
        action={parent}
        trailing={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className="shrink-0 rounded px-1 text-[11px] text-[var(--color-text-faint)] transition hover:text-[var(--color-accent)]"
          >
            {open ? "hide steps" : `${steps.length} step${steps.length > 1 ? "s" : ""}`}
          </button>
        }
      />
      {open && (
        <div className="ml-[5px] flex flex-col gap-1 border-l border-[var(--glass-border)] pl-3">
          {steps.map((s, i) => (
            <ActionRow key={s.id ?? `${i}-${s.label}-${s.detail}`} action={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/** How many trailing rows stay visible while the rest folds behind "+N more". */
const ACTIONS_VISIBLE = 6;

/** The tool-call timeline above a reply: quiet rows, newest activity last,
 *  long runs fold their head behind a "+N more tool calls" toggle. Subagent
 *  calls nest under their Task row; the freshest plan snapshot becomes the
 *  checklist card (earlier ones stay plain rows). */
function ActionTimeline({ actions }: { actions: ChatAction[] }) {
  const [expanded, setExpanded] = useState(false);

  const steps = new Map<string, ChatAction[]>();
  const top: ChatAction[] = [];
  for (const a of actions) {
    if (a.parentId) {
      const arr = steps.get(a.parentId);
      if (arr) arr.push(a);
      else steps.set(a.parentId, [a]);
    } else {
      top.push(a);
    }
  }
  const lastPlan = [...top].reverse().find((a) => a.todos?.length);

  const foldable = Math.max(0, top.length - ACTIONS_VISIBLE);
  const hidden = expanded ? 0 : foldable;
  const shown = hidden ? top.slice(hidden) : top;

  return (
    <div className="mb-2.5 flex flex-col gap-1">
      {foldable > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="self-start text-[11.5px] text-[var(--color-text-faint)] transition hover:text-[var(--color-accent)]"
        >
          {expanded
            ? "Show less"
            : `+${foldable} more tool call${foldable > 1 ? "s" : ""}`}
        </button>
      )}
      {shown.map((a, i) => {
        const key = a.id ?? `${hidden + i}-${a.label}-${a.detail}`;
        if (a.todos?.length && a === lastPlan) return <TodoCard key={key} todos={a.todos} />;
        const kids = a.id ? steps.get(a.id) : undefined;
        if (kids?.length) return <SubagentGroup key={key} parent={a} steps={kids} />;
        return <ActionRow key={key} action={a} />;
      })}
    </div>
  );
}

/** Live-streamed reasoning trace; open while it's the only thing happening.
 *  The summary carries a word count (settled) or a "thinking…" pulse (live),
 *  so a long reasoning pass reads as substantial work, not an empty toggle. */
function ThinkingBlock({
  text,
  initiallyOpen,
  live,
}: {
  text: string;
  initiallyOpen: boolean;
  live: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="chat-thinking mb-2"
    >
      <summary>
        <span className="inline-flex items-center gap-1.5 align-middle">
          <IconSparkle size={11} className="text-[var(--color-accent)]" />
          <span>Reasoning</span>
          {live ? (
            <span className="chat-thinking-live font-mono text-[10px] normal-case text-[var(--color-text-faint)]">
              thinking…
            </span>
          ) : (
            words > 0 && (
              <span className="font-mono text-[10px] normal-case text-[var(--color-text-faint)]">
                {words} word{words === 1 ? "" : "s"}
              </span>
            )
          )}
        </span>
      </summary>
      <div className="whitespace-pre-wrap pt-1.5">{text}</div>
    </details>
  );
}

export function ChatMessageRow({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-[8px] bg-[var(--color-surface-2)] px-4 py-2.5 text-[13.5px] leading-relaxed">
          <LinkifiedText text={message.content} />
        </div>
      </div>
    );
  }

  const provider = (message.provider ?? "anthropic") as ChatProvider;
  const color = PROVIDER_COLOR[provider] ?? "var(--color-accent)";
  const ProviderLogo = PROVIDER_LOGO[provider] ?? PROVIDER_LOGO.anthropic;
  const waiting = streaming && !message.content && !message.thinking && !message.actions.length;

  return (
    <div className="group">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-faint)]">
          <span className="flex items-center gap-1.5" style={{ color }}>
            <ProviderLogo size={12} />
            {message.model != null ? modelLabel(provider, message.model) : provider}
          </span>
          {message.inputTokens != null && <span title="Input tokens">↑{fmtTokens(message.inputTokens)}</span>}
          {message.outputTokens != null && <span title="Output tokens">↓{fmtTokens(message.outputTokens)}</span>}
          {!streaming && message.content && <CopyButton text={message.content} />}
        </div>

        {message.thinking && (
          <ThinkingBlock
            text={message.thinking}
            initiallyOpen={streaming && !message.content}
            live={streaming && !message.content}
          />
        )}

        {message.actions.length > 0 && <ActionTimeline actions={message.actions} />}

        {message.content && (
          <div
            className="chat-md"
            onClick={onLinkClick}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}

        {waiting && (
          <span className="text-[12px] text-[var(--color-text-faint)]">waiting for the model…</span>
        )}
        {streaming && !waiting && <span className="chat-caret mt-1 inline-block" />}
      </div>
    </div>
  );
}
