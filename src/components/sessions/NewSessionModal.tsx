import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { IconClose, IconFolder } from "../icons";
import { AGENT_COLOR, AGENT_LOGO, CLI_CAPS, type CliOption } from "../../lib/agents";
import type { CliInfo, CliKind, Profile } from "../../lib/bindings";

export interface NewSessionConfig {
  cli: CliKind;
  cwd?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  profileId?: string;
}

interface NewSessionModalProps {
  open: boolean;
  clis: CliInfo[];
  profiles: Profile[];
  defaultCwd?: string;
  defaultProfileId?: string;
  /** Pre-selected Claude permission mode (from settings). */
  defaultPermission?: string;
  /** Pre-selected Claude effort level (from settings). */
  defaultEffort?: string;
  onLaunch: (config: NewSessionConfig) => void;
  onClose: () => void;
}

const labelClass = "mb-1.5 block text-[12px] font-medium text-[var(--color-text-muted)]";
const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2 text-[13px] text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]";

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: CliOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NewSessionModal({
  open: isOpen,
  clis,
  profiles,
  defaultCwd,
  defaultProfileId,
  defaultPermission = "default",
  defaultEffort = "default",
  onLaunch,
  onClose,
}: NewSessionModalProps) {
  const [cli, setCli] = useState<CliKind>("claude");
  const [cwd, setCwd] = useState<string | undefined>(defaultCwd);
  const [profileId, setProfileId] = useState("");
  const [model, setModel] = useState("default");
  const [customModel, setCustomModel] = useState("");
  const [permission, setPermission] = useState(defaultPermission);
  const [effort, setEffort] = useState(defaultEffort);

  const resetOptions = () => {
    setModel("default");
    setCustomModel("");
    setPermission(defaultPermission);
    setEffort(defaultEffort);
  };

  useEffect(() => {
    if (!isOpen) return;
    setCli(clis.find((c) => c.available)?.kind ?? "claude");
    setCwd(defaultCwd);
    setProfileId(defaultProfileId ?? "");
    resetOptions();
    // resetOptions reads the latest default props; deps below cover the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultCwd, defaultProfileId, defaultPermission, defaultEffort, clis]);

  const caps = CLI_CAPS[cli];
  const selectedAvailable = clis.find((c) => c.kind === cli)?.available ?? false;
  const hasControls = !!(caps.models || caps.permissions || caps.effort);

  const pickFolder = async () => {
    const selected = await open({ directory: true, title: "Select a folder" });
    if (typeof selected === "string") setCwd(selected);
  };

  const selectCli = (kind: CliKind) => {
    setCli(kind);
    resetOptions();
  };

  const launch = () => {
    const resolvedModel = caps.models
      ? model === "custom"
        ? customModel.trim() || undefined
        : model === "default"
          ? undefined
          : model
      : undefined;
    onLaunch({
      cli,
      cwd,
      model: resolvedModel,
      permissionMode: caps.permissions && permission !== "default" ? permission : undefined,
      effort: caps.effort && effort !== "default" ? effort : undefined,
      profileId: profileId || undefined,
    });
  };

  const profileOptions: CliOption[] = [
    { value: "", label: "None (default login)" },
    ...profiles.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[460px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--glass-border)] p-5 animate-[popIn_180ms_var(--ease-natural)]">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-[15px] font-semibold">New session</Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>

          <label className={labelClass}>Agent CLI</label>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {clis.map((c) => {
              const selected = cli === c.kind;
              const Logo = AGENT_LOGO[c.kind];
              return (
                <button
                  key={c.kind}
                  type="button"
                  disabled={!c.available}
                  onClick={() => selectCli(c.kind)}
                  style={selected ? { borderColor: AGENT_COLOR[c.kind] } : undefined}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    selected
                      ? "bg-[var(--color-surface-2)]"
                      : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <span style={{ color: AGENT_COLOR[c.kind] }} className="flex shrink-0">
                    <Logo size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{c.label}</span>
                    <span className="block truncate font-mono text-[10px] text-[var(--color-text-faint)]">
                      {c.available ? c.version : "not installed"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className={labelClass}>Folder</label>
          <button
            type="button"
            onClick={() => void pickFolder()}
            className="mb-4 flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left transition hover:bg-[var(--color-surface-2)]"
          >
            <span className="shrink-0 text-[var(--color-accent)]">
              <IconFolder size={15} />
            </span>
            <span className="truncate font-mono text-[12px]">{cwd ?? "Default (home)"}</span>
          </button>

          {profiles.length > 0 && (
            <div className="mb-4">
              <Field
                label="Profile"
                value={profileId}
                options={profileOptions}
                onChange={setProfileId}
              />
            </div>
          )}

          {hasControls ? (
            <div className="mb-5 space-y-3.5">
              {caps.models && (
                <div>
                  <Field label="Model" value={model} options={caps.models} onChange={setModel} />
                  {model === "custom" && (
                    <input
                      autoFocus
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="exact model name (e.g. claude-opus-4-8)"
                      className={`${fieldClass} mt-2 font-mono`}
                    />
                  )}
                </div>
              )}
              {caps.permissions && (
                <Field
                  label="Permissions"
                  value={permission}
                  options={caps.permissions}
                  onChange={setPermission}
                />
              )}
              {caps.effort && (
                <Field
                  label={cli === "claude" ? "Effort (thinking)" : "Reasoning"}
                  value={effort}
                  options={caps.effort}
                  onChange={setEffort}
                />
              )}
            </div>
          ) : (
            <p className="mb-5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-text-faint)]">
              Launches interactively — choose the model and settings inside the session.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Dialog.Close className="rounded-lg px-3 py-2 text-[13px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={launch}
              disabled={!selectedAvailable}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Launch
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
