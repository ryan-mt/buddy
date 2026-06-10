import { useEffect, useRef, useState } from "react";
import { IconFormation, IconPlay, IconTrash } from "../icons";
import { AGENT_COLOR, AGENT_LOGO } from "../../lib/agents";
import { useApp } from "../../store";
import type { Formation } from "../../lib/formations";

/** One saved formation: name, the squad's CLI marks, launch & delete. */
function FormationRow({ formation }: { formation: Formation }) {
  const launchFormation = useApp((s) => s.launchFormation);
  const removeFormation = useApp((s) => s.removeFormation);

  return (
    <li>
      <div
        onClick={() => launchFormation(formation.id)}
        title={`Launch ${formation.slots.length} pane${formation.slots.length > 1 ? "s" : ""}`}
        className="group flex cursor-pointer items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 transition-colors hover:bg-[var(--color-surface)]"
      >
        <div className="flex shrink-0 items-center -space-x-1">
          {formation.slots.slice(0, 4).map((slot, i) => {
            const Mark = AGENT_LOGO[slot.cli];
            return (
              <span
                key={i}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-surface-2)]"
                style={{ color: AGENT_COLOR[slot.cli] }}
              >
                <Mark size={10} />
              </span>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-[var(--color-text)]">{formation.name}</div>
          <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
            {formation.slots.length} pane{formation.slots.length > 1 ? "s" : ""}
          </div>
        </div>
        <span className="rounded-md p-0.5 text-[var(--color-text-faint)] opacity-0 transition group-hover:opacity-100">
          <IconPlay size={13} />
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeFormation(formation.id);
          }}
          className="rounded-md p-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-danger)] group-hover:opacity-100"
          title="Delete formation"
        >
          <IconTrash size={13} />
        </button>
      </div>
    </li>
  );
}

/** Sidebar block: saved multi-agent layouts, plus "save the current one". */
export function FormationsSection() {
  const formations = useApp((s) => s.formations);
  const layout = useApp((s) => s.layout);
  const saveFormation = useApp((s) => s.saveFormation);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  if (!layout && formations.length === 0) return null;

  const commit = () => {
    if (name.trim()) saveFormation(name);
    setNaming(false);
    setName("");
  };

  return (
    <>
      <div className="mb-1.5 mt-4 flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-[var(--color-text-faint)]">
          Formations · {formations.length}
        </span>
        {layout && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            title="Save the current pane layout as a formation"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            <IconFormation size={12} /> Save
          </button>
        )}
      </div>
      {naming && (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setNaming(false);
              setName("");
            }
          }}
          placeholder="Formation name…"
          className="mb-1.5 w-full rounded-lg border border-[var(--color-accent-dim)] bg-[var(--color-surface)] px-2 py-1 text-[12px] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      )}
      {formations.length > 0 ? (
        <ul className="space-y-0.5">
          {formations.map((f) => (
            <FormationRow key={f.id} formation={f} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-1 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
          Save your split layout to relaunch the whole squad in one click.
        </p>
      )}
    </>
  );
}
