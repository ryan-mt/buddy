import { lazy, Suspense, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { MainHeader } from "./components/layout/MainHeader";
import { PaneGrid } from "./components/layout/PaneGrid";
import { AgentDock } from "./components/layout/AgentDock";
import { EmptyState } from "./components/layout/EmptyState";
import { Toasts } from "./components/Toasts";
import { NewSessionModal } from "./components/sessions/NewSessionModal";
import { PromptComposer } from "./components/sessions/PromptComposer";
import { ConfirmCloseDialog } from "./components/sessions/ConfirmCloseDialog";
import { InstallModal } from "./components/sessions/InstallModal";
import { TranscriptViewer } from "./components/sessions/TranscriptViewer";
import { ProfileModal } from "./components/profiles/ProfileModal";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { useApp } from "./store";

const Workspace = lazy(() => import("./components/editor/Workspace"));
const ChatView = lazy(() => import("./components/chat/ChatView"));
const DiffViewer = lazy(() =>
  import("./components/diff/DiffViewer").then((m) => ({ default: m.DiffViewer })),
);
const PulsePanel = lazy(() => import("./components/pulse/PulsePanel"));

export default function App() {
  const sessions = useApp((s) => s.sessions);
  const view = useApp((s) => s.view);
  const workspace = useApp((s) => s.workspace);
  const transcript = useApp((s) => s.transcript);
  const diffView = useApp((s) => s.diffView);
  const pulseOpen = useApp((s) => s.pulseOpen);
  const theme = useApp((s) => s.theme);
  const settings = useApp((s) => s.settings);
  const clis = useApp((s) => s.clis);
  const profiles = useApp((s) => s.profiles);
  const modal = useApp((s) => s.modal);
  const installOpen = useApp((s) => s.installOpen);
  const profileModal = useApp((s) => s.profileModal);
  const settingsOpen = useApp((s) => s.settingsOpen);

  // Initial loads.
  useEffect(() => {
    const { refreshClis, refreshProjects, refreshProfiles, refreshHistory } = useApp.getState();
    // Update check rides the detection pass — toasts when something is newer.
    void refreshClis().then(() => useApp.getState().checkCliUpdates(true));
    void refreshProjects();
    void refreshProfiles();
    void refreshHistory();
    // Reopen the previous workspace without asking when settings say so.
    const s = useApp.getState();
    if (s.settings.restoreOnLaunch === "always" && s.restorable) s.restoreWorkspace();
  }, []);

  // Global shortcuts. Ctrl/Cmd+Shift avoids clobbering the terminal's own keys,
  // and the capture phase beats xterm's textarea handler. Reads the store via
  // getState so the handler is registered exactly once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const s = useApp.getState();
      // Ctrl/Cmd+K — the one chord without Shift: find in terminal.
      if (!e.shiftKey) {
        if (e.code === "KeyK" && s.activeId) {
          s.setSearchOpen(!s.searchOpen);
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      let handled = true;
      if (e.code === "KeyT") {
        if (s.clis.some((c) => c.available)) s.openModal({});
      } else if (e.code === "KeyK") {
        s.setPaletteOpen(!s.paletteOpen);
      } else if (e.code === "KeyW") {
        if (s.activeId) s.requestClose(s.activeId);
      } else if (e.code === "KeyF") {
        if (s.activeId) s.setSearchOpen(!s.searchOpen);
      } else if (e.code === "KeyZ") {
        s.toggleZoom();
      } else if (e.code === "KeyB") {
        s.toggleBroadcast();
      } else if (e.code === "KeyC") {
        s.setView(s.view === "chat" ? "cli" : "chat");
      } else if (e.code === "KeyP") {
        if (s.sessions.some((t) => !t.exited)) s.setComposerOpen(!s.composerOpen);
      } else if (e.code === "KeyO") {
        s.setPulseOpen(!s.pulseOpen);
      } else if (e.code === "KeyA") {
        s.jumpToAttention();
      } else if (e.code === "KeyS") {
        s.toggleSidebar();
      } else if (e.code === "Slash") {
        s.setShortcutsOpen(!s.shortcutsOpen);
      } else if (e.code === "BracketRight") {
        s.cycleSession(1);
      } else if (e.code === "BracketLeft") {
        s.cycleSession(-1);
      } else if (e.code === "KeyG") {
        // Git changes for the open workspace, else the active session's folder.
        if (s.diffView) {
          s.closeDiff();
        } else {
          const active = s.sessions.find((t) => t.id === s.activeId);
          const target =
            s.workspace ??
            (active?.cwd
              ? { rootPath: active.cwd, rootName: active.cwd.split(/[\\/]+/).filter(Boolean).pop() ?? active.cwd }
              : null);
          if (target) s.openDiff(target);
          else s.pushToast("No folder to diff — open a workspace or a session with a folder", "error");
        }
      } else if (e.code === "Comma") {
        s.setSettingsOpen(true);
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const target = s.sessions[Number(e.code.slice(5)) - 1];
        if (target) s.selectSession(target.id);
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="flex h-screen text-[var(--color-text)]">
      <Sidebar />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <MainHeader />

        <div className="relative flex-1">
          {sessions.length === 0 && !workspace && !transcript && view !== "chat" && (
            <EmptyState />
          )}

          <PaneGrid
            hidden={!!workspace || !!transcript || view === "chat" || pulseOpen}
            dockVisible={sessions.length > 0 && view !== "chat" && !pulseOpen}
          />

          {view === "chat" && (
            <div className="absolute inset-0 z-10">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-[var(--color-bg)] text-[13px] text-[var(--color-text-faint)]">
                    Loading chat…
                  </div>
                }
              >
                <ChatView />
              </Suspense>
            </div>
          )}

          {/* Kept mounted but hidden under the chat view — display:none stops
              Monaco from painting (overlap + lag) without dropping tab state. */}
          {workspace && (
            <div className={`absolute inset-0 ${view === "chat" ? "hidden" : ""}`}>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-text-faint)]">
                    Loading workspace…
                  </div>
                }
              >
                <Workspace
                  key={workspace.rootPath}
                  rootPath={workspace.rootPath}
                  rootName={workspace.rootName}
                  theme={theme}
                />
              </Suspense>
            </div>
          )}
        </div>

        {transcript && (
          <div className={`absolute inset-0 z-20 ${view === "chat" ? "hidden" : ""}`}>
            <TranscriptViewer
              key={transcript.id}
              session={transcript}
              onClose={() => useApp.getState().viewTranscript(null)}
            />
          </div>
        )}

        {diffView && (
          <div className={`absolute inset-0 z-20 ${view === "chat" ? "hidden" : ""}`}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-[var(--color-bg)] text-[13px] text-[var(--color-text-faint)]">
                  Loading changes…
                </div>
              }
            >
              <DiffViewer
                key={diffView.rootPath}
                rootPath={diffView.rootPath}
                rootName={diffView.rootName}
                onClose={() => useApp.getState().closeDiff()}
              />
            </Suspense>
          </div>
        )}

        {pulseOpen && (
          <div className="absolute inset-0 z-30">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-[var(--color-bg)] text-[13px] text-[var(--color-text-faint)]">
                  Loading Pulse…
                </div>
              }
            >
              <PulsePanel />
            </Suspense>
          </div>
        )}

        <AgentDock />
      </main>

      <NewSessionModal
        open={modal !== null}
        clis={clis}
        profiles={profiles}
        defaultCwd={modal?.cwd}
        defaultProfileId={modal?.profileId}
        defaultPermission={settings.defaultPermission}
        defaultEffort={settings.defaultEffort}
        onLaunch={(config) => useApp.getState().launch(config)}
        onClose={() => useApp.getState().closeModal()}
      />

      <ProfileModal
        open={profileModal !== null}
        profile={profileModal?.editing ?? null}
        onSave={(input) =>
          void useApp.getState().saveProfile(profileModal?.editing ?? null, input)
        }
        onClose={() => useApp.getState().setProfileModal(null)}
      />

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        theme={theme}
        onChangeSettings={(next) => useApp.getState().updateSettings(next)}
        onChangeTheme={(next) => useApp.getState().setTheme(next)}
        onClose={() => useApp.getState().setSettingsOpen(false)}
      />

      <InstallModal
        open={installOpen}
        clis={clis}
        onInstalled={() => void useApp.getState().refreshClis()}
        onClose={() => {
          useApp.getState().setInstallOpen(false);
          void useApp.getState().refreshClis();
        }}
      />

      <ConfirmCloseDialog />
      <PromptComposer />
      <CommandPalette />
      <ShortcutsOverlay />
      <Toasts />
    </div>
  );
}
