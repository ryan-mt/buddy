import { IconPencil, IconPlay, IconPlus, IconTrash } from "../icons";
import type { Profile } from "../../lib/bindings";

interface ProfilesPanelProps {
  profiles: Profile[];
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onRemoveProfile: (profile: Profile) => void;
  /** Launch a session bound to this profile (isolated login / config). */
  onLaunchProfile: (profile: Profile) => void;
}

export function ProfilesPanel({
  profiles,
  onAddProfile,
  onEditProfile,
  onRemoveProfile,
  onLaunchProfile,
}: ProfilesPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onAddProfile}
        className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-2 text-[13px] font-medium text-[var(--color-text-muted)] transition hover:border-[var(--color-accent-dim)] hover:text-[var(--color-text)]"
      >
        <IconPlus size={15} /> New profile
      </button>

      <div className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        profiles · {profiles.length}
      </div>

      {profiles.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-[var(--color-text-faint)]">
          No profiles yet.
          <br />
          Add one to run separate accounts side by side.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <div
                onClick={() => onLaunchProfile(profile)}
                className="group flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 transition-colors hover:bg-[var(--color-surface-2)]"
                title="Launch a session with this profile"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: profile.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-[var(--color-text)]">{profile.name}</div>
                  {profile.model && (
                    <div className="truncate font-mono text-[11px] text-[var(--color-text-faint)]">
                      {profile.model}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunchProfile(profile);
                    }}
                    title="Launch session"
                    className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                  >
                    <IconPlay size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditProfile(profile);
                    }}
                    title="Edit profile"
                    className="rounded p-1 text-[var(--color-text-faint)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
                  >
                    <IconPencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveProfile(profile);
                    }}
                    title="Remove profile"
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
