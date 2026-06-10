import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose } from "../icons";
import { EditorPane } from "./EditorPane";
import { FileTree } from "./FileTree";
import { api } from "../../lib/bindings";
import type { Theme } from "../../lib/theme";

interface WorkspaceProps {
  rootPath: string;
  rootName: string;
  theme: Theme;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

const LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  xml: "xml",
  sql: "sql",
  php: "php",
  rb: "ruby",
};

function langForFile(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANG[ext] ?? "plaintext";
}

/**
 * A per-project code workspace: a lazily-loaded file tree on the left, a Monaco
 * editor with one tab per open file on the right. Default-exported so it can be
 * `React.lazy`-loaded (Monaco only enters the bundle when first opened).
 */
export default function Workspace({ rootPath, rootName, theme }: WorkspaceProps) {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mirror of `files` for synchronous reads inside async/ref-bound callbacks.
  const filesRef = useRef<OpenFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const openFile = useCallback(async (path: string, name: string) => {
    setError(null);
    if (filesRef.current.some((f) => f.path === path)) {
      setActivePath(path);
      return;
    }
    try {
      const content = await api.readFile(path);
      setFiles((prev) =>
        prev.some((f) => f.path === path) ? prev : [...prev, { path, name, content, dirty: false }],
      );
      setActivePath(path);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const changeContent = useCallback((path: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content, dirty: true } : f)));
  }, []);

  const saveFile = useCallback(async (path: string) => {
    const file = filesRef.current.find((f) => f.path === path);
    if (!file || !file.dirty) return;
    try {
      await api.writeFile(path, file.content);
      setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, dirty: false } : f)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const closeFile = useCallback((path: string) => {
    const cur = filesRef.current;
    const idx = cur.findIndex((f) => f.path === path);
    const next = cur.filter((f) => f.path !== path);
    setFiles(next);
    setActivePath((a) =>
      a === path ? (next[idx]?.path ?? next[idx - 1]?.path ?? null) : a,
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (activePath) void saveFile(activePath);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePath, saveFile]);

  const active = files.find((f) => f.path === activePath) ?? null;

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <div className="w-60 shrink-0 border-r border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <FileTree
          rootPath={rootPath}
          rootName={rootName}
          activePath={activePath}
          onOpenFile={(p, n) => void openFile(p, n)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {files.length > 0 && (
          <div className="flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
            {files.map((f) => {
              const isActive = f.path === activePath;
              return (
                <div
                  key={f.path}
                  onClick={() => setActivePath(f.path)}
                  className={`group flex cursor-pointer items-center gap-2 px-3 text-[12px] ${
                    isActive
                      ? "bg-[var(--color-bg)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <span className="max-w-[140px] truncate">{f.name}</span>
                  {f.dirty && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFile(f.path);
                    }}
                    className="rounded p-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] group-hover:opacity-100"
                    title="Close file"
                  >
                    <IconClose size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-accent)]">
            {error}
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {active ? (
            <EditorPane
              path={active.path}
              language={langForFile(active.name)}
              value={active.content}
              theme={theme === "light" ? "light" : "vs-dark"}
              onChange={(v) => changeContent(active.path, v)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-text-faint)]">
              Select a file from the tree to start editing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
