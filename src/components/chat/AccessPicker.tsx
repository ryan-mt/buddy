// Tool-access picker: how much the agent may touch this machine. "Auto"
// follows the project context (read-only inside a project, conversation-only
// outside); "Full access" hands the CLI its whole toolset — the chip turns
// warning-colored so elevated turns are impossible to miss.

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconShield } from "../icons";
import { composerChip, menuContent, menuItem } from "./ui";
import { ACCESS_LEVELS, resolveAccess } from "../../lib/chatModels";
import { useChat } from "../../store/chat";

export function AccessPicker() {
  const access = useChat((s) => s.access);
  const setAccess = useChat((s) => s.setAccess);
  const thread = useChat((s) => s.thread);
  const provider = useChat((s) => s.provider);
  const activeProjectId = useChat((s) => s.activeProjectId);
  const projects = useChat((s) => s.projects);

  // What the NEXT turn actually gets — same resolution as send().
  const projectId = thread ? thread.projectId : activeProjectId;
  const hasProject = !!projects.find((p) => p.id === projectId)?.path;
  const resolved = resolveAccess(access, hasProject);
  const label = ACCESS_LEVELS.find((l) => l.value === resolved)?.label ?? "Auto";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={composerChip}
          title="Tool access for this chat"
          style={resolved === "full" ? { color: "var(--color-warning)" } : undefined}
        >
          <IconShield
            size={11}
            className={resolved === "full" ? "" : "text-[var(--color-text-faint)]"}
          />
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="start" className={`${menuContent} w-[230px]`}>
          <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
            Tool access
          </div>
          {ACCESS_LEVELS.map((l) => (
            <DropdownMenu.Item key={l.value} className={menuItem} onSelect={() => setAccess(l.value)}>
              <span className="min-w-0 flex-1">
                <span style={l.value === "full" ? { color: "var(--color-warning)" } : undefined}>
                  {l.label}
                </span>
                <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">{l.note}</span>
              </span>
              {l.value === access && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
              )}
            </DropdownMenu.Item>
          ))}
          <div className="px-2 pb-0.5 pt-1 text-[10.5px] leading-relaxed text-[var(--color-text-faint)]">
            Full access lets the agent edit files and run commands without asking.
            {provider === "openai" &&
              " Codex sessions keep their policy — a change applies from the next new thread."}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
