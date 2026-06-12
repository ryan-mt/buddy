// Working-tree diff overlay: a file rail on the left, a side-by-side diff on
// the right. The backend hands us numbered rows (full context); pairing
// deletions with additions and folding long unchanged runs happens here, so
// the DOM only ever holds what's visible.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  IconBranch,
  IconClose,
  IconDiff,
  IconRestart,
  IconSpinner,
} from "../icons";
import { api, type DiffRow, type FileDiff, type GitChange, type GitChanges } from "../../lib/bindings";
import { errorMessage } from "../../store";

/** Unchanged lines kept visible around each change. */
const CONTEXT = 3;
/** Unchanged runs shorter than this render in full (a tiny fold is noise). */
const MIN_FOLD = 10;

interface Cell {
  no: number;
  text: string;
  kind: "context" | "add" | "del";
}

interface SbsRow {
  left: Cell | null;
  right: Cell | null;
  changed: boolean;
}

type Segment =
  | { kind: "rows"; start: number; rows: SbsRow[] }
  | { kind: "fold"; start: number; rows: SbsRow[] };

/** Pair the linear rows into side-by-side rows (dels zip with adds). */
export function toSideBySide(rows: DiffRow[]): SbsRow[] {
  const out: SbsRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.kind === "context") {
      const cell = { text: r.text, kind: "context" as const };
      out.push({
        left: { ...cell, no: r.oldNo ?? 0 },
        right: { ...cell, no: r.newNo ?? 0 },
        changed: false,
      });
      i++;
      continue;
    }
    const dels: DiffRow[] = [];
    const adds: DiffRow[] = [];
    while (i < rows.length && rows[i].kind !== "context") {
      (rows[i].kind === "del" ? dels : adds).push(rows[i]);
      i++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      out.push({
        left: dels[k] ? { no: dels[k].oldNo ?? 0, text: dels[k].text, kind: "del" } : null,
        right: adds[k] ? { no: adds[k].newNo ?? 0, text: adds[k].text, kind: "add" } : null,
        changed: true,
      });
    }
  }
  return out;
}

/** Split rows into visible segments and foldable unchanged runs. */
export function toSegments(rows: SbsRow[]): Segment[] {
  // A row stays visible when a change sits within CONTEXT of it.
  const keep = new Array<boolean>(rows.length).fill(false);
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].changed) continue;
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) {
      keep[k] = true;
    }
  }
  const segments: Segment[] = [];
  let i = 0;
  while (i < rows.length) {
    const foldable = !keep[i];
    let j = i;
    while (j < rows.length && !keep[j] === foldable) j++;
    const slice = rows.slice(i, j);
    if (foldable && slice.length >= MIN_FOLD) {
      segments.push({ kind: "fold", start: i, rows: slice });
    } else if (segments.length && segments[segments.length - 1].kind === "rows") {
      // Merge short unchanged runs into the neighbouring visible segment.
      segments[segments.length - 1].rows.push(...slice);
    } else {
      segments.push({ kind: "rows", start: i, rows: slice });
    }
    i = j;
  }
  return segments;
}

const STATUS_STYLE: Record<GitChange["status"], { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--color-warning)" },
  added: { letter: "A", color: "var(--color-running)" },
  untracked: { letter: "A", color: "var(--color-running)" },
  deleted: { letter: "D", color: "var(--color-danger)" },
  conflicted: { letter: "!", color: "var(--color-danger)" },
};

function Counts({ added, removed }: { added: number | null; removed: number | null }) {
  return (
    <span className="shrink-0 font-mono text-[10.5px]">
      <span className="text-[var(--color-running)]">+{added ?? "?"}</span>{" "}
      <span className="text-[var(--color-danger)]">−{removed ?? "?"}</span>
    </span>
  );
}

/** One half of a side-by-side row: line number + text, tinted by kind. */
function Half({ cell }: { cell: Cell | null }) {
  if (!cell) {
    return (
      <>
        <span className="select-none" style={{ background: "var(--diff-blank)" }} />
        <span style={{ background: "var(--diff-blank)" }} />
      </>
    );
  }
  const tint =
    cell.kind === "add"
      ? "color-mix(in srgb, var(--color-running) 12%, transparent)"
      : cell.kind === "del"
        ? "color-mix(in srgb, var(--color-danger) 11%, transparent)"
        : undefined;
  const gutter =
    cell.kind === "add"
      ? "color-mix(in srgb, var(--color-running) 20%, transparent)"
      : cell.kind === "del"
        ? "color-mix(in srgb, var(--color-danger) 18%, transparent)"
        : undefined;
  return (
    <>
      <span
        className="select-none pr-2 text-right text-[var(--color-text-faint)]"
        style={{ background: gutter }}
      >
        {cell.no}
      </span>
      <span className="whitespace-pre-wrap pl-2 pr-3 [overflow-wrap:anywhere]" style={{ background: tint }}>
        {cell.text || " "}
      </span>
    </>
  );
}

/** The diff body for one file — owns the fold-expansion state (keyed by path). */
function DiffBody({ file }: { file: FileDiff }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const segments = useMemo(() => toSegments(toSideBySide(file.rows)), [file]);

  if (file.binary) {
    return <CenterNote>Binary file — no text preview.</CenterNote>;
  }
  if (file.rows.length === 0) {
    return <CenterNote>No line changes (mode or metadata only).</CenterNote>;
  }
  return (
    <div className="pb-6">
      {file.truncated && (
        <div className="sticky top-0 z-10 border-b border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-4 py-1.5 text-[11px] text-[var(--color-warning)]">
          Large file — diff truncated at 20,000 lines.
        </div>
      )}
      {segments.map((seg) => {
        const isFold = seg.kind === "fold";
        if (isFold && !expanded.has(seg.start)) {
          return (
            <button
              key={seg.start}
              type="button"
              onClick={() => setExpanded((prev) => new Set(prev).add(seg.start))}
              className="flex w-full items-center justify-center gap-2 border-y border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/70 py-1 text-[11px] text-[var(--color-text-faint)] transition hover:text-[var(--color-accent)]"
            >
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
              {seg.rows.length.toLocaleString()} unmodified lines
            </button>
          );
        }
        return (
          <div key={seg.start}>
            {isFold && (
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.delete(seg.start);
                    return next;
                  })
                }
                className="flex w-full items-center justify-center gap-2 border-y border-[var(--color-border-soft)] bg-[var(--color-surface-2)]/70 py-1 text-[11px] text-[var(--color-text-faint)] transition hover:text-[var(--color-accent)]"
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 15l6-6 6 6" />
                </svg>
                Collapse {seg.rows.length.toLocaleString()} lines
              </button>
            )}
            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem_minmax(0,1fr)] font-mono text-[12px] leading-[1.5]">
              {seg.rows.map((row, i) => (
                // A fragment per visual row: grid auto-placement keeps the four
                // cells of a pair on one line, so left/right stay aligned.
                <Row key={i} row={row} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ row }: { row: SbsRow }) {
  return (
    <>
      <Half cell={row.left} />
      <Half cell={row.right} />
    </>
  );
}

function CenterNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[var(--color-text-faint)]">
      {children}
    </div>
  );
}

interface DiffViewerProps {
  rootPath: string;
  rootName: string;
  onClose: () => void;
}

export function DiffViewer({ rootPath, rootName, onClose }: DiffViewerProps) {
  const [changes, setChanges] = useState<GitChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<FileDiff | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileCache = useRef(new Map<string, FileDiff>());
  // Bumps on refresh so in-flight responses from a stale round are dropped.
  const round = useRef(0);

  const refresh = () => {
    const mine = ++round.current;
    setLoading(true);
    setError(null);
    fileCache.current.clear();
    api.gitChanges(rootPath).then(
      (next) => {
        if (round.current !== mine) return;
        setChanges(next);
        setLoading(false);
        // Keep the selection if the file is still changed; else pick the first.
        setSelected((prev) =>
          prev && next.files.some((f) => f.path === prev) ? prev : next.files[0]?.path ?? null,
        );
        setFile(null);
        setFileError(null);
      },
      (e: unknown) => {
        if (round.current !== mine) return;
        setError(errorMessage(e));
        setChanges(null);
        setLoading(false);
      },
    );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [rootPath]);

  // Load the selected file's rows (cached per refresh round).
  useEffect(() => {
    if (!selected || !changes) return;
    const cached = fileCache.current.get(selected);
    if (cached) {
      setFile(cached);
      setFileError(null);
      return;
    }
    const mine = round.current;
    const change = changes.files.find((f) => f.path === selected);
    setFile(null);
    setFileError(null);
    api.gitFileDiff(rootPath, selected, change?.status === "untracked").then(
      (diff) => {
        if (round.current !== mine) return;
        fileCache.current.set(selected, diff);
        // Only surface it if this file is still the one on screen.
        setSelected((cur) => {
          if (cur === selected) {
            setFile(diff);
            setFileError(null);
          }
          return cur;
        });
      },
      (e: unknown) => {
        if (round.current !== mine) return;
        setSelected((cur) => {
          if (cur === selected) setFileError(errorMessage(e));
          return cur;
        });
      },
    );
  }, [selected, changes, rootPath]);

  const selectedChange = changes?.files.find((f) => f.path === selected) ?? null;

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)] [--diff-blank:repeating-linear-gradient(45deg,transparent,transparent_5px,color-mix(in_srgb,var(--color-border)_30%,transparent)_5px,color-mix(in_srgb,var(--color-border)_30%,transparent)_6px)]">
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-[var(--color-border-soft)] px-4">
        <span className="flex text-[var(--color-accent)]">
          <IconDiff size={15} />
        </span>
        <span className="text-[13px] font-medium">{rootName}</span>
        <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
          changes
        </span>
        {changes && (
          <>
            <span className="flex items-center gap-1 rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              <IconBranch size={11} />
              {changes.branch}
            </span>
            <span className="font-mono text-[11px]">
              <span className="text-[var(--color-text-muted)]">
                {changes.files.length} file{changes.files.length === 1 ? "" : "s"}
              </span>{" "}
              <span className="text-[var(--color-running)]">+{changes.added.toLocaleString()}</span>{" "}
              <span className="text-[var(--color-danger)]">−{changes.removed.toLocaleString()}</span>
            </span>
          </>
        )}
        <span className="ml-auto truncate pl-4 font-mono text-[11px] text-[var(--color-text-faint)]">
          {rootPath}
        </span>
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          className="ml-3 rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <IconRestart size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close changes"
          className="rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <IconClose size={16} />
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]">
          <IconSpinner size={16} className="animate-spin" /> Reading working tree…
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-sm text-[13px] leading-relaxed text-[var(--color-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[12.5px] transition hover:border-[var(--color-accent-dim)]"
          >
            Try again
          </button>
        </div>
      ) : !changes || changes.files.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <span className="text-[var(--color-running)]">
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4.5 12.5l5 5L19.5 7" />
            </svg>
          </span>
          <p className="text-[13px] font-medium">Working tree clean</p>
          <p className="text-[12px] text-[var(--color-text-faint)]">No changes since the last commit.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* File rail */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--color-border-soft)] bg-[var(--color-surface)]/40 p-2">
            {changes.files.map((f) => {
              const s = STATUS_STYLE[f.status];
              const base = f.path.split("/").pop() ?? f.path;
              const dir = f.path.slice(0, f.path.length - base.length);
              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelected(f.path)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                    selected === f.path
                      ? "bg-[var(--color-surface-2)]"
                      : "hover:bg-[var(--color-surface-2)]/60"
                  }`}
                >
                  <span
                    className="w-3 shrink-0 text-center font-mono text-[11px] font-semibold"
                    style={{ color: s.color }}
                    title={f.status}
                  >
                    {s.letter}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-[var(--color-text)]">{base}</span>
                    {dir && (
                      <span className="block truncate font-mono text-[10px] text-[var(--color-text-faint)]">
                        {dir}
                      </span>
                    )}
                  </span>
                  {f.binary ? (
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">bin</span>
                  ) : (
                    <Counts added={f.added} removed={f.removed} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Diff pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            {selectedChange && (
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border-soft)] px-4">
                <span
                  className="font-mono text-[11px] font-semibold"
                  style={{ color: STATUS_STYLE[selectedChange.status].color }}
                >
                  {STATUS_STYLE[selectedChange.status].letter}
                </span>
                <span className="truncate font-mono text-[12px] text-[var(--color-text)]">
                  {selectedChange.path}
                </span>
                {!selectedChange.binary && (
                  <Counts added={selectedChange.added} removed={selectedChange.removed} />
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {fileError ? (
                <CenterNote>{fileError}</CenterNote>
              ) : file ? (
                <DiffBody key={selected} file={file} />
              ) : (
                <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]">
                  <IconSpinner size={15} className="animate-spin" /> Loading diff…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
