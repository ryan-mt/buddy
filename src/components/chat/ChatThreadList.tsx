// Sidebar panel for the chat view: new-thread button, a search box, projects
// (folders on disk — collapsible, with per-project instructions; chats inside
// run in the folder), and ungrouped chats. Every row carries an overflow menu.

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  IconChevron,
  IconDots,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "../icons";
import { ProjectDialog } from "./ProjectDialog";
import { RenameThreadDialog } from "./RenameThreadDialog";
import { menuContent, menuItem } from "./ui";
import { PROVIDER_COLOR, PROVIDER_LOGO } from "../../lib/chatModels";
import { api } from "../../lib/bindings";
import { useChat } from "../../store/chat";
import { errorMessage, useApp } from "../../store";
import type { ChatMeta, ChatProject, ChatProvider } from "../../lib/bindings";

function timeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const sectionLabel = "mb-1.5 flex items-center px-2 text-[11px] font-medium text-[var(--color-text-faint)]";
const iconBtn =
  "shrink-0 rounded p-0.5 text-[var(--color-text-faint)] opacity-0 transition hover:text-[var(--color-text)] group-hover:opacity-100 data-[state=open]:opacity-100";

function openProjectFolder(project: ChatProject): void {
  api.revealPath(project.path).catch((e) => {
    useApp.getState().pushToast(errorMessage(e), "error");
  });
}

function ThreadRow({
  meta,
  projects,
  onRename,
}: {
  meta: ChatMeta;
  projects: ChatProject[];
  onRename: (meta: ChatMeta) => void;
}) {
  const thread = useChat((s) => s.thread);
  const openThread = useChat((s) => s.openThread);
  const removeThread = useChat((s) => s.removeThread);
  const moveThread = useChat((s) => s.moveThread);

  const provider = (meta.provider ?? "anthropic") as ChatProvider;
  const Logo = PROVIDER_LOGO[provider] ?? PROVIDER_LOGO.anthropic;
  const color = PROVIDER_COLOR[provider] ?? "var(--color-accent)";
  const active = thread?.id === meta.id;
  const moveTargets = projects.filter((p) => p.id !== meta.projectId);

  return (
    <div
      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${
        active ? "bg-[var(--color-surface-2)]" : "hover:bg-[var(--color-surface-2)]"
      }`}
    >
      <button
        type="button"
        onClick={() => void openThread(meta.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="shrink-0" style={{ color }}>
          <Logo size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{meta.title}</span>
        <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">
          {timeAgo(meta.updatedAt)}
        </span>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" title="Chat actions" className={iconBtn} onClick={(e) => e.stopPropagation()}>
            <IconDots size={13} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content sideOffset={4} align="start" className={`${menuContent} w-[180px]`}>
            <DropdownMenu.Item className={menuItem} onSelect={() => onRename(meta)}>
              <IconPencil size={12} className="text-[var(--color-text-faint)]" /> Rename
            </DropdownMenu.Item>
            {(moveTargets.length > 0 || meta.projectId) && (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className={menuItem}>
                  <IconFolder size={12} className="text-[var(--color-text-faint)]" />
                  <span className="flex-1">Move to</span>
                  <IconChevron size={11} className="text-[var(--color-text-faint)]" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent sideOffset={6} className={`${menuContent} w-[170px]`}>
                    {moveTargets.map((p) => (
                      <DropdownMenu.Item
                        key={p.id}
                        className={menuItem}
                        onSelect={() => void moveThread(meta.id, p.id)}
                      >
                        <span className="truncate">{p.name}</span>
                      </DropdownMenu.Item>
                    ))}
                    {meta.projectId && (
                      <DropdownMenu.Item
                        className={`${menuItem} text-[var(--color-text-muted)]`}
                        onSelect={() => void moveThread(meta.id, null)}
                      >
                        No project
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            )}
            <DropdownMenu.Item
              className={`${menuItem} text-[var(--color-danger)]`}
              onSelect={() => void removeThread(meta.id)}
            >
              <IconTrash size={12} /> Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

/** How many thread rows a section shows before folding behind "Show more". */
const THREADS_VISIBLE = 5;

/** Thread rows capped at THREADS_VISIBLE with a Show more / Show less toggle
 *  (newest threads are first, so the fold hides the old tail). */
function ThreadRows({
  threads,
  projects,
  onRename,
}: {
  threads: ChatMeta[];
  projects: ChatProject[];
  onRename: (meta: ChatMeta) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? threads : threads.slice(0, THREADS_VISIBLE);
  const folded = threads.length - THREADS_VISIBLE;
  return (
    <>
      {shown.map((meta) => (
        <ThreadRow key={meta.id} meta={meta} projects={projects} onRename={onRename} />
      ))}
      {folded > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="rounded-lg px-2 py-1 text-left text-[11.5px] text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          {showAll ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function ProjectSection({
  project,
  threads,
  projects,
  onEdit,
  onRenameThread,
}: {
  project: ChatProject;
  threads: ChatMeta[];
  projects: ChatProject[];
  onEdit: (project: ChatProject) => void;
  onRenameThread: (meta: ChatMeta) => void;
}) {
  const activeProjectId = useChat((s) => s.activeProjectId);
  const threadOpen = useChat((s) => s.thread !== null);
  const newThread = useChat((s) => s.newThread);
  const removeProject = useChat((s) => s.removeProject);
  const [collapsed, setCollapsed] = useState(false);

  // Highlight the folder only on its fresh-chat hero; once a thread is open
  // that row carries the highlight (both lit read as one stuck blob).
  const activeHere = activeProjectId === project.id && !threadOpen;

  return (
    <div className="mb-0.5">
      <div
        className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition ${
          activeHere ? "bg-[var(--color-surface-2)]" : "hover:bg-[var(--color-surface-2)]"
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand project" : "Collapse project"}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <IconChevron
            size={11}
            className={`shrink-0 text-[var(--color-text-faint)] transition-transform ${collapsed ? "" : "rotate-90"}`}
          />
          <span className={`shrink-0 ${activeHere ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`}>
            <IconFolder size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium leading-tight">{project.name}</span>
            {project.path && (
              <span className="block truncate font-mono text-[10px] leading-tight text-[var(--color-text-faint)]" title={project.path}>
                {project.path}
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">{threads.length}</span>
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" title="Project actions" className={iconBtn}>
              <IconDots size={13} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content sideOffset={4} align="start" className={`${menuContent} w-[190px]`}>
              <DropdownMenu.Item className={menuItem} onSelect={() => newThread(project.id)}>
                <IconPlus size={12} className="text-[var(--color-text-faint)]" /> New chat here
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={() => onEdit(project)}>
                <IconPencil size={12} className="text-[var(--color-text-faint)]" /> Name &amp; instructions
              </DropdownMenu.Item>
              {project.path && (
                <DropdownMenu.Item className={menuItem} onSelect={() => openProjectFolder(project)}>
                  <IconFolder size={12} className="text-[var(--color-text-faint)]" /> Open folder
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                className={`${menuItem} text-[var(--color-danger)]`}
                onSelect={() => void removeProject(project.id)}
              >
                <IconTrash size={12} /> Remove (keeps chats)
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {!collapsed && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-[var(--color-border-soft)] pl-1.5">
          {threads.length === 0 ? (
            <button
              type="button"
              onClick={() => newThread(project.id)}
              className="rounded-lg px-2 py-1 text-left text-[11.5px] text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              + Start the first chat
            </button>
          ) : (
            <ThreadRows threads={threads} projects={projects} onRename={onRenameThread} />
          )}
        </div>
      )}
    </div>
  );
}

export function ChatThreadList() {
  const metas = useChat((s) => s.metas);
  const projects = useChat((s) => s.projects);
  const newThread = useChat((s) => s.newThread);
  const addProject = useChat((s) => s.addProject);
  const [editProject, setEditProject] = useState<ChatProject | null>(null);
  const [renameFor, setRenameFor] = useState<ChatMeta | null>(null);
  const [query, setQuery] = useState("");

  const knownProject = (id: string | null): id is string => !!id && projects.some((p) => p.id === id);
  const grouped = new Map<string, ChatMeta[]>(projects.map((p) => [p.id, []]));
  const ungrouped: ChatMeta[] = [];
  for (const meta of metas) {
    if (knownProject(meta.projectId)) grouped.get(meta.projectId)!.push(meta);
    else ungrouped.push(meta);
  }

  const q = query.trim().toLowerCase();
  const results = q ? metas.filter((m) => m.title.toLowerCase().includes(q)) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => newThread(null)}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110"
      >
        <IconPlus size={15} /> New chat
      </button>

      {metas.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-2 py-1.5 transition focus-within:border-[var(--color-accent-dim)]">
          <IconSearch size={12} className="shrink-0 text-[var(--color-text-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--color-text-faint)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)] transition hover:text-[var(--color-text)]"
            >
              esc
            </button>
          )}
        </div>
      )}

      {q ? (
        <>
          <div className={sectionLabel}>
            <span className="flex-1">Results · {results.length}</span>
          </div>
          {results.length === 0 ? (
            <p className="px-2 pt-1 text-[12px] text-[var(--color-text-muted)]">No chat titles match.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.map((meta) => (
                <ThreadRow key={meta.id} meta={meta} projects={projects} onRename={setRenameFor} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void addProject()}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-2 text-[12.5px] font-medium text-[var(--color-text-muted)] transition hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text)]"
          >
            <IconFolderPlus size={14} /> Add project
          </button>

          <div className={sectionLabel}>
            <span className="flex-1">Projects · {projects.length}</span>
          </div>
          {projects.length === 0 ? (
            <p className="px-2 pb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
              Add a folder from your disk — chats inside it can read its code, and a project can carry
              instructions every chat starts with.
            </p>
          ) : (
            <div className="mb-2 flex flex-col gap-0.5">
              {projects.map((p) => (
                <ProjectSection
                  key={p.id}
                  project={p}
                  threads={grouped.get(p.id) ?? []}
                  projects={projects}
                  onEdit={setEditProject}
                  onRenameThread={setRenameFor}
                />
              ))}
            </div>
          )}

          <div className={sectionLabel}>
            <span className="flex-1">Chats · {ungrouped.length}</span>
          </div>
          {ungrouped.length === 0 ? (
            <p className="px-2 pt-1 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              Chat rides your Claude Code &amp; Codex logins. Threads land here.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              <ThreadRows threads={ungrouped} projects={projects} onRename={setRenameFor} />
            </div>
          )}
        </>
      )}

      <ProjectDialog project={editProject} onClose={() => setEditProject(null)} />
      <RenameThreadDialog meta={renameFor} onClose={() => setRenameFor(null)} />
    </>
  );
}
