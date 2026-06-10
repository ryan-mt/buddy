import { IconFolder, IconFolderPlus, IconPlay, IconTrash } from "../icons";
import type { Project } from "../../types";

interface ProjectsPanelProps {
  projects: Project[];
  onAddProject: () => void;
  /** Open the project in the code editor (row click). */
  onEditProject: (project: Project) => void;
  /** Launch a CLI session in the project (play button). */
  onLaunchProject: (project: Project) => void;
  /** Remove the project from the saved list. */
  onRemoveProject: (project: Project) => void;
}

export function ProjectsPanel({
  projects,
  onAddProject,
  onEditProject,
  onLaunchProject,
  onRemoveProject,
}: ProjectsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onAddProject}
        className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-2 text-[13px] font-medium text-[var(--color-text-muted)] transition hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text)]"
      >
        <IconFolderPlus size={15} /> Add project
      </button>

      <div className="mb-1.5 px-1 text-[11px] font-medium text-[var(--color-text-faint)]">
        Projects · {projects.length}
      </div>

      {projects.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
          No projects yet.
          <br />
          Add a folder to edit it or launch a CLI there.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {projects.map((project) => (
            <li key={project.id}>
              <div
                onClick={() => onEditProject(project)}
                className="group flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors hover:bg-[var(--color-surface-2)]"
                title="Open in editor"
              >
                <span className="shrink-0 text-[var(--color-accent)]">
                  <IconFolder size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-[var(--color-text)]">{project.name}</div>
                  <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
                    {project.path}
                  </div>
                </div>
                <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunchProject(project);
                    }}
                    title="Launch a session here"
                    className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                  >
                    <IconPlay size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveProject(project);
                    }}
                    title="Remove project"
                    className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
