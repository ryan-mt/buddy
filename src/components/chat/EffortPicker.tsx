// Reasoning-effort dial. "Auto" omits the parameter (provider default); the
// store maps the chosen level to each provider's wire value at send time.
// Levels are filtered to what the selected model actually accepts — switching
// to a model that lacks the stored level quietly shows (and sends) Auto.

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconSparkle } from "../icons";
import { composerChip, menuContent, menuItem } from "./ui";
import { effectiveEffort, effortsFor, EFFORT_LEVELS } from "../../lib/chatModels";
import { useChat } from "../../store/chat";

export function EffortPicker() {
  const provider = useChat((s) => s.provider);
  const model = useChat((s) => s.model);
  const effort = useChat((s) => s.effort);
  const setEffort = useChat((s) => s.setEffort);

  const supported = effortsFor(provider, model);
  const levels = EFFORT_LEVELS.filter((l) => l.value === "auto" || supported.includes(l.value));
  const current = effectiveEffort(provider, model, effort);
  const label = EFFORT_LEVELS.find((l) => l.value === current)?.label ?? "Auto";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={composerChip} title="Reasoning effort">
          <IconSparkle size={11} className="text-[var(--color-text-faint)]" />
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} align="start" className={`${menuContent} w-[200px]`}>
          <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
            Effort
          </div>
          {levels.map((l) => (
            <DropdownMenu.Item key={l.value} className={menuItem} onSelect={() => setEffort(l.value)}>
              <span className="min-w-0 flex-1">
                {l.label}
                {l.note && (
                  <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">{l.note}</span>
                )}
              </span>
              {l.value === current && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
