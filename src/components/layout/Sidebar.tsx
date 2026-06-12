import type { ReactNode } from "react";
import {
  IconChat,
  IconDownload,
  IconFolder,
  IconHistory,
  IconMoon,
  IconPlus,
  IconProfiles,
  IconPulse,
  IconRail,
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
import { AGENT_COLOR, AGENT_LOGO } from "../../lib/agents";
import { useApp } from "../../store";
import { nextTheme, themeInfo, themeMode } from "../../lib/theme";
import type { SessionTab, SidebarView } from "../../types";

const iconBtn =
  "rounded-md p-1.5 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";

const VIEWS: { value: SidebarView; label: string; icon: ReactNode }[] = [
  { value: "cli", label: "Sessions", icon: <IconTerminal size={16} /> },
  { value: "chat", label: "Chat", icon: <IconChat size={16} /> },
  { value: "projects", label: "Projects", icon: <IconFolder size={16} /> },
  { value: "profiles", label: "Profiles", icon: <IconProfiles size={16} /> },
  { value: "history", label: "History", icon: <IconHistory size={16} /> },
];

/** One session in the rail: the agent's mark, status told by a corner dot. */
function RailSession({ session }: { session: SessionTab }) {
  const active = useApp((s) => s.activeId === session.id);
  const activity = useApp((s) => s.activity[session.id]);
  const AgentLogo = AGENT_LOGO[session.cli];
  const color = session.exited ? "var(--color-text-faint)" : AGENT_COLOR[session.cli];
  const dotColor =
    activity === "attention" ? "var(--color-warning)" : AGENT_COLOR[session.cli];
  const dotClass =
    !session.exited && activity === "attention"
      ? "dot-ring"
      : !session.exited && activity === "busy"
        ? "dot-glow"
        : "";

  return (
    <button
      type="button"
      onClick={() => {
        const s = useApp.getState();
        s.setView("cli");
        s.selectSession(session.id);
      }}
      title={session.title}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
        active
          ? "bg-[var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-accent-dim)]"
          : "hover:bg-[var(--color-surface)]"
      } ${session.exited ? "opacity-55" : ""}`}
    >
      <span style={{ color }}>
        <AgentLogo size={16} />
      </span>
      {!session.exited && activity && (
        <span
          className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full ${dotClass}`}
          style={{ backgroundColor: dotColor, color: dotColor }}
        />
      )}
    </button>
  );
}

/** The narrow icon rail (Ctrl+Shift+S): views, live sessions, the essentials. */
function Rail() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const theme = useApp((s) => s.theme);
  const sessions = useApp((s) => s.sessions);
  const hasCli = useApp((s) => s.clis.some((c) => c.available));

  return (
    <aside className="glass grain flex w-[58px] flex-col items-center gap-1 border-r border-[var(--glass-border)] py-3">
      <div className="relative pb-1">
        <Logo size={26} />
      </div>

      <div className="relative flex flex-col gap-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            title={v.label}
            className={`rounded-lg p-2 transition ${
              view === v.value
                ? "bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                : "text-[var(--color-text-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            }`}
          >
            {v.icon}
          </button>
        ))}
      </div>

      <span className="relative my-1 h-px w-7 bg-[var(--color-border-soft)]" />

      <button
        type="button"
        onClick={() => useApp.getState().openModal({})}
        disabled={!hasCli}
        title="New session (Ctrl+Shift+T)"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <IconPlus size={16} />
      </button>

      <div className="relative flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1 [scrollbar-width:none]">
        {sessions.map((session) => (
          <RailSession key={session.id} session={session} />
        ))}
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={() => useApp.getState().setPulseOpen(true)}
            title="Pulse — every agent at a glance (Ctrl+Shift+O)"
            className={iconBtn}
          >
            <IconPulse size={15} />
          </button>
        )}
      </div>

      <div className="relative flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={() => useApp.getState().cycleTheme()}
          title={`Theme: ${themeInfo(theme).label} — click for ${themeInfo(nextTheme(theme)).label}`}
          className={iconBtn}
        >
          {themeMode(theme) === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>
        <button
          type="button"
          onClick={() => useApp.getState().setSettingsOpen(true)}
          title="Settings (Ctrl+Shift+,)"
          className={iconBtn}
        >
          <IconSettings size={15} />
        </button>
        <button
          type="button"
          onClick={() => useApp.getState().toggleSidebar()}
          title="Expand sidebar (Ctrl+Shift+S)"
          className={iconBtn}
        >
          <IconRail size={15} />
        </button>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const theme = useApp((s) => s.theme);
  const cycleTheme = useApp((s) => s.cycleTheme);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const collapsed = useApp((s) => s.settings.sidebarCollapsed);
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

  if (collapsed) return <Rail />;

  return (
    <aside className="glass grain flex w-64 flex-col border-r border-[var(--glass-border)]">
      <div className="relative flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo size={28} />
        <span className="font-display text-[16px] font-semibold tracking-tight">buddy</span>
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
        <button
          type="button"
          onClick={() => useApp.getState().toggleSidebar()}
          title="Collapse sidebar (Ctrl+Shift+S)"
          className={iconBtn}
        >
          <IconRail size={16} />
        </button>
      </div>

      <div className="relative px-3 pb-3">
        <SegmentedControl<SidebarView>
          value={view}
          onChange={setView}
          compact
          segments={VIEWS.map((v) => ({ value: v.value, label: v.label, icon: v.icon }))}
        />
      </div>

      <div className="relative flex-1 overflow-y-auto px-2 pb-2">
        {view === "cli" ? (
          <>
            <button
              type="button"
              onClick={() => openModal({})}
              disabled={!hasCli}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] shadow-[var(--shadow-pop),inset_0_1px_0_rgba(255,255,255,0.25)] transition [background:linear-gradient(180deg,color-mix(in_srgb,var(--color-accent)_92%,white),var(--color-accent-dim))] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
            <div className="mb-1.5 flex items-center justify-between pl-2 pr-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
              <span>Sessions · {sessions.length}</span>
              {sessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => useApp.getState().setPulseOpen(true)}
                  title="Pulse — every agent at a glance (Ctrl+Shift+O)"
                  className="rounded-md p-1 transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                >
                  <IconPulse size={13} />
                </button>
              )}
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
