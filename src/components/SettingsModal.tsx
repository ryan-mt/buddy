import * as Dialog from "@radix-ui/react-dialog";
import { IconClose, IconMoon, IconSun } from "./icons";
import { SegmentedControl } from "./layout/SegmentedControl";
import { CLI_CAPS } from "../lib/agents";
import type { Settings } from "../lib/settings";
import type { Theme } from "../lib/theme";

const labelClass = "mb-1.5 block text-[12px] font-medium text-[var(--color-text-muted)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]";

const SHORTCUTS: [string, string][] = [
  ["⌃⇧T", "New session"],
  ["⌃⇧W", "Close session"],
  ["⌃⇧F", "Find in terminal"],
  ["⌃⇧Z", "Zoom pane"],
  ["⌃⇧1…9", "Switch session"],
  ["⌃⇧,", "Settings"],
];

interface SettingsModalProps {
  open: boolean;
  settings: Settings;
  theme: Theme;
  onChangeSettings: (settings: Settings) => void;
  onChangeTheme: (theme: Theme) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  settings,
  theme,
  onChangeSettings,
  onChangeTheme,
  onClose,
}: SettingsModalProps) {
  const patch = (part: Partial<Settings>) => onChangeSettings({ ...settings, ...part });
  const claude = CLI_CAPS.claude;

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
            <Dialog.Title className="text-[15px] font-semibold">Settings</Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Theme</label>
            <SegmentedControl<Theme>
              value={theme}
              onChange={onChangeTheme}
              segments={[
                { value: "dark", label: "Dark", icon: <IconMoon size={15} /> },
                { value: "light", label: "Light", icon: <IconSun size={15} /> },
              ]}
            />
          </div>

          <div className="mb-4">
            <label className={labelClass}>Terminal font size · {settings.terminalFontSize}px</label>
            <input
              type="range"
              min={10}
              max={20}
              step={1}
              value={settings.terminalFontSize}
              onChange={(e) => patch({ terminalFontSize: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent)]"
            />
            <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
              Applies to newly opened sessions.
            </p>
          </div>

          <div className="mb-4">
            <label className={labelClass}>Default permission (Claude)</label>
            <select
              value={settings.defaultPermission}
              onChange={(e) => patch({ defaultPermission: e.target.value })}
              className={fieldClass}
            >
              {claude.permissions?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label className={labelClass}>Default effort (Claude)</label>
            <select
              value={settings.defaultEffort}
              onChange={(e) => patch({ defaultEffort: e.target.value })}
              className={fieldClass}
            >
              {claude.effort?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Keyboard shortcuts</label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
              {SHORTCUTS.map(([keys, action]) => (
                <div key={action} className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-[var(--color-text-muted)]">{action}</span>
                  <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text)]">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
