import { lazy, Suspense, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { MainHeader } from "./components/layout/MainHeader";
import { PaneGrid } from "./components/layout/PaneGrid";
import { EmptyState } from "./components/layout/EmptyState";
import { Toasts } from "./components/Toasts";
import { NewSessionModal } from "./components/sessions/NewSessionModal";
import { ConfirmCloseDialog } from "./components/sessions/ConfirmCloseDialog";
import { InstallModal } from "./components/sessions/InstallModal";
import { TranscriptViewer } from "./components/sessions/TranscriptViewer";
import { ProfileModal } from "./components/profiles/ProfileModal";
import { SettingsModal } from "./components/SettingsModal";
import { useApp } from "./store";

const Workspace = lazy(() => import("./components/editor/Workspace"));

export default function App() {
  const sessions = useApp((s) => s.sessions);
  const workspace = useApp((s) => s.workspace);
  const transcript = useApp((s) => s.transcript);
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
    void refreshClis();
    void refreshProjects();
    void refreshProfiles();
    void refreshHistory();
  }, []);

  // Global shortcuts. Ctrl/Cmd+Shift avoids clobbering the terminal's own keys,
  // and the capture phase beats xterm's textarea handler. Reads the store via
  // getState so the handler is registered exactly once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey || e.altKey) return;
      const s = useApp.getState();
      let handled = true;
      if (e.code === "KeyT") {
        if (s.clis.some((c) => c.available)) s.openModal({});
      } else if (e.code === "KeyW") {
        if (s.activeId) s.requestClose(s.activeId);
      } else if (e.code === "KeyF") {
        if (s.activeId) s.setSearchOpen(!s.searchOpen);
      } else if (e.code === "KeyZ") {
        s.toggleZoom();
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
          {sessions.length === 0 && !workspace && !transcript && <EmptyState />}

          <PaneGrid hidden={!!workspace || !!transcript} />

          {workspace && (
            <div className="absolute inset-0">
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
          <div className="absolute inset-0 z-20">
            <TranscriptViewer
              key={transcript.id}
              session={transcript}
              onClose={() => useApp.getState().viewTranscript(null)}
            />
          </div>
        )}
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
      <Toasts />
    </div>
  );
}
