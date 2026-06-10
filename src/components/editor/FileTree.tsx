import { useEffect, useState } from "react";
import { IconChevron, IconFile, IconFolder, IconSpinner } from "../icons";
import { api, type DirEntry } from "../../lib/bindings";

interface FileTreeProps {
  rootPath: string;
  rootName: string;
  activePath: string | null;
  onOpenFile: (path: string, name: string) => void;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

const ROW =
  "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[12.5px] transition-colors hover:bg-[var(--color-surface-2)]";

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 12 });

function FileRow({
  entry,
  depth,
  active,
  onOpen,
}: {
  entry: DirEntry;
  depth: number;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={indent(depth)}
      className={`${ROW} ${
        active
          ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)]"
      }`}
    >
      <IconFile size={14} className="shrink-0 text-[var(--color-text-faint)]" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function DirRow({
  entry,
  depth,
  activePath,
  onOpenFile,
}: {
  entry: DirEntry;
  depth: number;
  activePath: string | null;
  onOpenFile: (path: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) {
      setLoading(true);
      try {
        setChildren(await api.readDir(entry.path));
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void toggle()}
        style={indent(depth)}
        className={`${ROW} text-[var(--color-text-muted)]`}
      >
        <IconChevron
          size={13}
          className={`shrink-0 text-[var(--color-text-faint)] transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <IconFolder size={14} className="shrink-0 text-[var(--color-accent)]" />
        <span className="truncate">{entry.name}</span>
        {loading && (
          <IconSpinner size={12} className="ml-auto animate-spin text-[var(--color-text-faint)]" />
        )}
      </button>
      {expanded &&
        children?.map((c) =>
          c.isDir ? (
            <DirRow
              key={c.path}
              entry={c}
              depth={depth + 1}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ) : (
            <FileRow
              key={c.path}
              entry={c}
              depth={depth + 1}
              active={c.path === activePath}
              onOpen={() => onOpenFile(c.path, c.name)}
            />
          ),
        )}
    </div>
  );
}

export function FileTree({ rootPath, rootName, activePath, onOpenFile }: FileTreeProps) {
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChildren(null);
    setError(null);
    api
      .readDir(rootPath)
      .then((c) => !cancelled && setChildren(c))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 px-2.5 py-2 font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
        <IconFolder size={13} className="text-[var(--color-accent)]" />
        <span className="truncate">{rootName}</span>
      </div>
      <div className="flex-1 overflow-auto pb-2">
        {error ? (
          <p className="px-3 py-2 text-[12px] leading-relaxed text-[var(--color-text-faint)]">
            {error}
          </p>
        ) : children === null ? (
          <p className="px-3 py-2 text-[12px] text-[var(--color-text-faint)]">Loading…</p>
        ) : (
          children.map((c) =>
            c.isDir ? (
              <DirRow
                key={c.path}
                entry={c}
                depth={0}
                activePath={activePath}
                onOpenFile={onOpenFile}
              />
            ) : (
              <FileRow
                key={c.path}
                entry={c}
                depth={0}
                active={c.path === activePath}
                onOpen={() => onOpenFile(c.path, c.name)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}
