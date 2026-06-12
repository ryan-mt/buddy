// Header strip while the chat view is open: thread title, active model,
// running token tally, export, and a new-thread shortcut. Rendered by MainHeader.

import { save } from "@tauri-apps/plugin-dialog";
import { IconChat, IconDownload, IconPlus } from "../icons";
import { api } from "../../lib/bindings";
import { modelLabel, PROVIDER_COLOR, PROVIDER_LOGO } from "../../lib/chatModels";
import { useChat, type ChatThreadState } from "../../store/chat";
import { errorMessage, useApp } from "../../store";

/** Write the thread out as a Markdown transcript via a save dialog. */
async function exportThread(thread: ChatThreadState): Promise<void> {
  const safe = thread.title.replace(/[\\/:*?"<>|]/g, "-").trim() || "chat";
  const target = await save({
    title: "Export chat as Markdown",
    defaultPath: `${safe}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!target) return;
  const lines: string[] = [`# ${thread.title}`, ""];
  for (const m of thread.messages) {
    if (!m.content) continue;
    const who = m.role === "user" ? "You" : m.model || m.provider || "Assistant";
    lines.push(`**${who}** · ${new Date(m.createdAt).toLocaleString()}`, "", m.content, "");
  }
  try {
    await api.writeFile(target, lines.join("\n"));
    useApp.getState().pushToast("Chat exported as Markdown");
  } catch (e) {
    useApp.getState().pushToast(errorMessage(e), "error");
  }
}

const headerBtn =
  "rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";

export function ChatHeader() {
  const thread = useChat((s) => s.thread);
  const provider = useChat((s) => s.provider);
  const model = useChat((s) => s.model);
  const streaming = useChat((s) => s.streaming);
  const newThread = useChat((s) => s.newThread);
  const projects = useChat((s) => s.projects);
  const activeProjectId = useChat((s) => s.activeProjectId);

  const projectId = thread ? thread.projectId : activeProjectId;
  const projectName = projects.find((p) => p.id === projectId)?.name;
  const ProviderLogo = PROVIDER_LOGO[provider];
  const color = PROVIDER_COLOR[provider];
  const tokens = (thread?.messages ?? []).reduce(
    (acc, m) => ({
      in: acc.in + (m.inputTokens ?? 0),
      out: acc.out + (m.outputTokens ?? 0),
    }),
    { in: 0, out: 0 },
  );

  return (
    <>
      <span className="text-[var(--color-accent)]">
        <IconChat size={15} />
      </span>
      {projectName && (
        <span className="max-w-[140px] truncate text-[12px] text-[var(--color-text-faint)]">
          {projectName} <span className="mx-0.5">/</span>
        </span>
      )}
      <span className="truncate text-[13px] font-medium">{thread?.title ?? "New chat"}</span>
      <span
        className="flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px]"
        style={{ color }}
      >
        <ProviderLogo size={11} />
        {modelLabel(provider, model)}
      </span>
      {tokens.in + tokens.out > 0 && (
        <span
          title="Thread token usage (input / output)"
          className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]"
        >
          ↑{tokens.in.toLocaleString()} ↓{tokens.out.toLocaleString()}
        </span>
      )}
      {streaming && <span className="text-[11px] text-[var(--color-running)]">streaming…</span>}
      <span className="ml-auto flex items-center">
        {thread && thread.messages.some((m) => m.content) && (
          <button
            type="button"
            onClick={() => void exportThread(thread)}
            title="Export chat as Markdown"
            className={headerBtn}
          >
            <IconDownload size={15} />
          </button>
        )}
        <button type="button" onClick={() => newThread()} title="New chat" className={headerBtn}>
          <IconPlus size={16} />
        </button>
      </span>
    </>
  );
}
