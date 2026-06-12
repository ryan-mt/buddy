import {
  IconChat,
  IconDownload,
  IconFolder,
  IconHistory,
  IconMoon,
  IconPlus,
  IconProfiles,
  IconSettings,
  IconSun,
  IconTerminal,
} from "../icons";
import { ChatThreadList } from "../chat/ChatThreadList";
import { Logo } from "../Logo";
import { SegmentedControl } from "./SegmentedControl";
import { SessionList } from "../sessions/SessionList";
import { FormationsSection } from "../sessions/FormationsSection";
import { HistoryPanel } from "../sessions/HistoryPanel";
import { ProjectsPanel } from "../projects/ProjectsPanel";
import { ProfilesPanel } from "../profiles/ProfilesPanel";
import { useApp } from "../../store";
import { nextTheme, themeInfo, themeMode } from "../../lib/theme";
import type { SidebarView } from "../../types";

const iconBtn =
  "rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";

export function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const theme = useApp((s) => s.theme);
  const cycleTheme = useApp((s) => s.cycleTheme);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const clis = useApp((s) => s.clis);
  const clisError = useApp((s) => s.clisError);
  const refreshClis = useApp((s) => s.refreshClis);
  const sessions = useApp((s) => s.sessions);
  const projects = useApp((s) => s.projects);
  const profiles = useApp((s) => s.profiles);
  const history = useApp((s) => s.history);
  const openModal = useApp((s) => s.openModal);
  const setInstallOpen = useApp((s) => s.setInstallOpen);
  const setProfileModal = useApp((s) => s.setProfileModal);
  const addProject = useApp((s) => s.addProject);
  const removeProject = useApp((s) => s.removeProject);
  const openWorkspace = useApp((s) => s.openWorkspace);
  const removeProfile = useApp((s) => s.removeProfile);
  const resumeTracked = useApp((s) => s.resumeTracked);
  const resumeDisk = useApp((s) => s.resumeDisk);
  const viewTranscript = useApp((s) => s.viewTranscript);
  const removeHistory = useApp((s) => s.removeHistory);
  const clearHistory = useApp((s) => s.clearHistory);

  const availableClis = clis.filter((c) => c.available);
  const hasCli = availableClis.length > 0;

  return (
    <aside className="glass grain flex w-64 flex-col border-r border-[var(--glass-border)]">
      <div className="relative flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo size={28} />
        <span className="font-mono text-[15px] font-semibold tracking-tight">buddy</span>
        <button
          type="button"
          onClick={cycleTheme}
          title={`Theme: ${themeInfo(theme).label} — click for ${themeInfo(nextTheme(theme)).label}`}
          className={`ml-auto ${iconBtn}`}
        >
          {themeMode(theme) === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings (Ctrl+Shift+,)"
          className={iconBtn}
        >
          <IconSettings size={16} />
        </button>
      </div>

      <div className="relative px-3 pb-3">
        <SegmentedControl<SidebarView>
          value={view}
          onChange={setView}
          compact
          segments={[
            { value: "cli", label: "Sessions", icon: <IconTerminal size={16} /> },
            { value: "chat", label: "Chat", icon: <IconChat size={16} /> },
            { value: "projects", label: "Projects", icon: <IconFolder size={16} /> },
            { value: "profiles", label: "Profiles", icon: <IconProfiles size={16} /> },
            { value: "history", label: "History", icon: <IconHistory size={16} /> },
          ]}
        />
      </div>

      <div className="relative flex-1 overflow-y-auto px-2 pb-2">
        {view === "cli" ? (
          <>
            <button
              type="button"
              onClick={() => openModal({})}
              disabled={!hasCli}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <IconPlus size={15} /> New session
            </button>
            <button
              type="button"
              onClick={() => setInstallOpen(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] py-2 text-[13px] font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <IconDownload size={15} /> Install CLIs
            </button>
            <div className="mb-1.5 px-2 text-[11px] font-medium text-[var(--color-text-faint)]">
              Sessions · {sessions.length}
            </div>
            <SessionList />
            <FormationsSection />
          </>
        ) : view === "chat" ? (
          <ChatThreadList />
        ) : view === "projects" ? (
          <ProjectsPanel
            projects={projects}
            onAddProject={() => void addProject()}
            onEditProject={openWorkspace}
            onLaunchProject={(p) => openModal({ cwd: p.path, title: p.name })}
            onDiffProject={(p) => useApp.getState().openDiff({ rootPath: p.path, rootName: p.name })}
            onRemoveProject={(p) => void removeProject(p.id)}
          />
        ) : view === "profiles" ? (
          <ProfilesPanel
            profiles={profiles}
            onAddProfile={() => setProfileModal({ editing: null })}
            onEditProfile={(p) => setProfileModal({ editing: p })}
            onRemoveProfile={(p) => void removeProfile(p.id)}
            onLaunchProfile={(p) => openModal({ profileId: p.id })}
          />
        ) : (
          <HistoryPanel
            sessions={history}
            profiles={profiles}
            onResumeTracked={resumeTracked}
            onResumeDisk={resumeDisk}
            onViewTranscript={viewTranscript}
            onRemove={(rec) => void removeHistory(rec.id)}
            onClear={() => void clearHistory()}
          />
        )}
      </div>

      {/* CLI versions live in Settings → About; the footer only surfaces
          while nothing is installed, as the way back to detection. */}
      {!hasCli && (
        <div className="relative flex items-center gap-2 border-t border-[var(--color-border-soft)] px-4 py-2.5 text-[11px]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-text-faint)]" />
          <button
            onClick={() => void refreshClis()}
            className="font-mono text-[var(--color-text-muted)] underline-offset-2 hover:underline"
          >
            {clisError ? "no CLI found — retry" : "detecting…"}
          </button>
        </div>
      )}
    </aside>
  );
}
