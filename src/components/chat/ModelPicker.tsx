// The composer's model switcher: one popover listing both CLIs' models, with
// a custom-id escape hatch. Threads can mix models turn by turn — switching
// here only affects the next message. Models ride the installed CLIs, so the
// only status that matters is whether a CLI is present.

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconChevron } from "../icons";
import { CustomModelDialog } from "./CustomModelDialog";
import { composerChip, menuContent, menuItem } from "./ui";
import {
  CHAT_MODELS,
  modelLabel,
  PROVIDER_COLOR,
  PROVIDER_LABEL,
  PROVIDER_LOGO,
  PROVIDERS,
} from "../../lib/chatModels";
import { useApp } from "../../store";
import { useChat } from "../../store/chat";
import type { ChatProvider } from "../../lib/bindings";

const CLI_FOR = { anthropic: "claude", openai: "codex" } as const;

export function ModelPicker() {
  const provider = useChat((s) => s.provider);
  const model = useChat((s) => s.model);
  const setModel = useChat((s) => s.setModel);
  const clis = useApp((s) => s.clis);
  const [customFor, setCustomFor] = useState<ChatProvider | null>(null);

  const ActiveLogo = PROVIDER_LOGO[provider];

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={composerChip} title="Switch model">
            <span style={{ color: PROVIDER_COLOR[provider] }}>
              <ActiveLogo size={13} />
            </span>
            {modelLabel(provider, model)}
            <IconChevron size={11} className="rotate-90 text-[var(--color-text-faint)]" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={6} align="start" className={`${menuContent} w-[270px]`}>
            {PROVIDERS.map((p, idx) => {
              const cli = clis.find((c) => c.kind === CLI_FOR[p]);
              const missing = cli ? !cli.available : false;
              const Logo = PROVIDER_LOGO[p];
              return (
                <div key={p}>
                  {idx > 0 && (
                    <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-[var(--color-border-soft)]" />
                  )}
                  <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5">
                    <span style={{ color: PROVIDER_COLOR[p] }}>
                      <Logo size={12} />
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                      {PROVIDER_LABEL[p]}
                    </span>
                    {missing && (
                      <span className="ml-auto font-mono text-[9.5px] text-[var(--color-warning)]">
                        not installed
                      </span>
                    )}
                  </div>
                  {CHAT_MODELS[p].map((m) => {
                    const active = provider === p && model === m.id;
                    return (
                      <DropdownMenu.Item
                        key={m.id || "cli-default"}
                        className={`${menuItem} ${missing ? "opacity-55" : ""}`}
                        onSelect={() => setModel(p, m.id)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{m.label}</span>
                          <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">
                            {m.note}
                          </span>
                        </span>
                        {active && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                        )}
                      </DropdownMenu.Item>
                    );
                  })}
                  <DropdownMenu.Item
                    className={`${menuItem} text-[var(--color-text-muted)]`}
                    onSelect={() => setCustomFor(p)}
                  >
                    Custom model…
                  </DropdownMenu.Item>
                </div>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <CustomModelDialog provider={customFor} onClose={() => setCustomFor(null)} />
    </>
  );
}
