// Live xterm scrollback readers, keyed by session tab id. A plain module map
// (not store state) — the readers are functions over mutable terminal buffers,
// nothing should re-render when they register.

const readers = new Map<string, () => string>();

export function registerScrollback(id: string, read: () => string): void {
  readers.set(id, read);
}

export function unregisterScrollback(id: string): void {
  readers.delete(id);
}

/** Plain-text scrollback of a live session, or null if it has no terminal. */
export function readScrollback(id: string): string | null {
  return readers.get(id)?.() ?? null;
}
