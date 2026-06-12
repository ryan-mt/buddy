// Live xterm scrollback readers, keyed by session tab id. A plain module map
// (not store state) — the readers are functions over mutable terminal buffers,
// nothing should re-render when they register.

const readers = new Map<string, () => string>();
const tailReaders = new Map<string, (maxLines: number) => string>();

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

export function registerTail(id: string, read: (maxLines: number) => string): void {
  tailReaders.set(id, read);
}

export function unregisterTail(id: string): void {
  tailReaders.delete(id);
}

/** The last lines of a live session's buffer — cheap (doesn't walk the whole
 *  scrollback), so the Pulse overlay and hover peeks can poll it. */
export function readTail(id: string, maxLines: number): string | null {
  return tailReaders.get(id)?.(maxLines) ?? null;
}
