import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconClose } from "../icons";
import { Terminal } from "../terminal/Terminal";
import { AGENT_COLOR, AGENT_LABEL, AGENT_LOGO } from "../../lib/agents";
import { api, type CliInfo, type CliKind, type InstallSpec, type NodeStatus } from "../../lib/bindings";

interface InstallModalProps {
  open: boolean;
  clis: CliInfo[];
  onClose: () => void;
  /** Called after an install finishes successfully so the parent re-detects. */
  onInstalled: () => void;
}

const cardClass = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3";

export function InstallModal({ open: isOpen, clis, onClose, onInstalled }: InstallModalProps) {
  const [specs, setSpecs] = useState<InstallSpec[]>([]);
  const [node, setNode] = useState<NodeStatus | null>(null);
  const [installing, setInstalling] = useState<CliKind | null>(null);
  // undefined = still running; null/number = exited with that code.
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) return;
    setInstalling(null);
    setExitCode(undefined);
    void api.installSpecs().then(setSpecs).catch(() => setSpecs([]));
    void api.nodeStatus().then(setNode).catch(() => setNode(null));
  }, [isOpen]);

  const installed = useMemo(() => {
    const map = new Map<CliKind, CliInfo>();
    for (const c of clis) if (c.available) map.set(c.kind, c);
    return map;
  }, [clis]);

  const nodeMissing = node ? !node.node : false;
  const needsNodeBanner = useMemo(
    () => nodeMissing && specs.some((s) => s.supported && s.requiresNode && !installed.has(s.kind)),
    [nodeMissing, specs, installed],
  );

  const startInstall = (kind: CliKind) => {
    setExitCode(undefined);
    setInstalling(kind);
  };

  const handleExit = (code: number | null) => {
    setExitCode(code);
    if (code === 0) onInstalled();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-[fadeIn_120ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-modal)] animate-[popIn_140ms_ease-out]">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-[15px] font-semibold">
              {installing ? `Install ${AGENT_LABEL[installing]}` : "Install a CLI"}
            </Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Close"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>

          {installing ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="h-[320px] overflow-hidden rounded-lg bg-[#0a0a0b] p-1.5">
                <Terminal
                  key={installing}
                  cli={installing}
                  start={(channel, rows, cols) =>
                    api.installCli({ cli: installing, rows, cols }, channel)
                  }
                  bootingLabel={`Installing ${AGENT_LABEL[installing]}…`}
                  onExit={handleExit}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                  {exitCode === undefined ? (
                    "Installing… follow any prompts in the terminal above."
                  ) : exitCode === 0 ? (
                    <span className="text-[var(--color-running)]">
                      Installed. If it doesn’t show up, restart buddy.
                    </span>
                  ) : (
                    <span className="text-[var(--color-danger)]">
                      Install exited with code {String(exitCode)} — see the output above.
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setInstalling(null)}
                  className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)]"
                >
                  {exitCode === undefined ? "Cancel" : "Back"}
                </button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {needsNodeBanner && (
                <div className="mb-3 rounded-xl border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-text)]">
                  <span className="font-medium">Node.js not found.</span> Some CLIs install with npm
                  and need it.
                  <span className="mt-1 block font-mono text-[11px] text-[var(--color-text-muted)]">
                    {node?.hint}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {clis.map((c) => {
                  const spec = specs.find((s) => s.kind === c.kind);
                  const Logo = AGENT_LOGO[c.kind];
                  const isInstalled = installed.has(c.kind);
                  const blockedByNode = !!spec?.requiresNode && nodeMissing;
                  return (
                    <div key={c.kind} className={cardClass}>
                      <div className="flex items-center gap-3">
                        <span style={{ color: AGENT_COLOR[c.kind] }} className="flex shrink-0">
                          <Logo size={22} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium">{c.label}</div>
                          <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
                            {isInstalled
                              ? (c.version ?? "installed")
                              : spec?.supported
                                ? spec.command
                                : "not available on this OS"}
                          </div>
                        </div>
                        {isInstalled ? (
                          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--color-running)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-running)]" />
                            Installed
                          </span>
                        ) : spec?.supported ? (
                          <button
                            type="button"
                            disabled={blockedByNode}
                            onClick={() => startInstall(c.kind)}
                            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {blockedByNode ? "Needs Node.js" : "Install"}
                          </button>
                        ) : (
                          <span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">
                            unsupported
                          </span>
                        )}
                      </div>
                      {spec?.note && !isInstalled && (
                        <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                          {spec.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
                Installs run the vendor’s official command in a live terminal. Review what each one
                does before running it.
              </p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
