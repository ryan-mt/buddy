// Reusable prompt snippets for the composer, persisted to localStorage.

export interface Snippet {
  id: string;
  text: string;
}

const KEY = "buddy-snippets";

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Snippet[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveSnippets(snippets: Snippet[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snippets));
  } catch {
    // persistence is best-effort
  }
}
