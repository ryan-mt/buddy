import "../../lib/monaco"; // side effect: bundle workers + point the loader at npm monaco
import Editor from "@monaco-editor/react";

interface EditorPaneProps {
  /** Absolute path; also the model URI, so each file keeps its own undo history. */
  path: string;
  language: string;
  value: string;
  /** Monaco theme id (e.g. "vs-dark" or "light"), following the app theme. */
  theme: string;
  onChange: (value: string) => void;
}

export function EditorPane({ path, language, value, theme, onChange }: EditorPaneProps) {
  return (
    <Editor
      height="100%"
      theme={theme}
      path={path}
      language={language}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      loading={
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-text-faint)]">
          Loading editor…
        </div>
      }
      options={{
        fontFamily: '"IBM Plex Mono", "Cascadia Code", Consolas, monospace',
        fontSize: 13,
        minimap: { enabled: false },
        smoothScrolling: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: "selection",
      }}
    />
  );
}
