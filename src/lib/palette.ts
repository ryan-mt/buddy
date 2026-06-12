// Fuzzy matching for the command palette. Pure ranking logic, kept apart from
// the React layer so it stays unit-testable: a query matches an item when its
// characters appear in order (subsequence), and scoring prefers word starts,
// consecutive runs, and earlier/denser matches.

/** A successful match: higher score = better, positions drive highlighting. */
export interface FuzzyMatch {
  score: number;
  /** Indices into the original text for each matched query character. */
  positions: number[];
}

const WORD_START_BONUS = 8;
const CONSECUTIVE_BONUS = 5;
const FIRST_CHAR_BONUS = 6;
/** Each skipped gap between matches costs a little — denser is better. */
const GAP_PENALTY = 0.5;

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const prev = text[index - 1];
  return prev === " " || prev === "-" || prev === "_" || prev === "/" || prev === ".";
}

/** Whether query[from..] still fits as a subsequence of text[start..]. */
function fits(q: string, from: number, t: string, start: number): boolean {
  let at = start;
  for (let i = from; i < q.length; i++) {
    at = t.indexOf(q[i], at);
    if (at === -1) return false;
    at++;
  }
  return true;
}

/**
 * Match `query` as a case-insensitive subsequence of `text`. Returns null when
 * it doesn't fit. Greedy left-to-right with a word-start lookahead: for each
 * query char, a word-start occurrence beats the nearest plain occurrence.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, positions: [] };
  if (q.length > t.length) return null;

  const positions: number[] = [];
  let score = 0;
  let from = 0;
  for (let i = 0; i < q.length; i++) {
    const plain = t.indexOf(q[i], from);
    if (plain === -1) return null;
    // Prefer the next word-start occurrence if there is one (e.g. "s" in
    // "New session" should anchor at "session", not the "w"…"s" inside words).
    // Never jump out of a consecutive run, and never to a spot the rest of
    // the query can't follow from ("switch" must not lose its 't' to "to").
    let at = plain;
    const continuesRun = positions.length > 0 && plain === positions[positions.length - 1] + 1;
    if (!isWordStart(t, plain) && !continuesRun) {
      for (let j = plain + 1; j < t.length; j++) {
        if (t[j] === q[i] && isWordStart(t, j) && fits(q, i + 1, t, j + 1)) {
          at = j;
          break;
        }
      }
    }
    if (i === 0 && at === 0) score += FIRST_CHAR_BONUS;
    if (isWordStart(t, at)) score += WORD_START_BONUS;
    if (positions.length && at === positions[positions.length - 1] + 1) {
      score += CONSECUTIVE_BONUS;
    }
    score -= (at - from) * GAP_PENALTY;
    positions.push(at);
    from = at + 1;
  }
  // Shorter targets win ties — "Settings" over "Open settings folder".
  score -= t.length * 0.05;
  return { score, positions };
}

/** Anything the palette can list. `hint` joins the match like hidden keywords. */
export interface PaletteEntry {
  /** Stable id so React keys and selection survive re-filtering. */
  id: string;
  label: string;
  /** Extra matchable text (section name, path, CLI…), not displayed as label. */
  hint?: string;
  /** Section header the UI groups by. */
  section: string;
  run: () => void;
}

export interface RankedEntry {
  entry: PaletteEntry;
  /** Highlight positions in the label; empty when the hint matched instead. */
  positions: number[];
}

/**
 * Filter and rank entries for a query. Empty query keeps the given order.
 * Label matches rank above hint-only matches of equal score.
 */
export function rankEntries(entries: PaletteEntry[], query: string): RankedEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return entries.map((entry) => ({ entry, positions: [] }));

  const ranked: { entry: PaletteEntry; positions: number[]; score: number }[] = [];
  for (const entry of entries) {
    const onLabel = fuzzyMatch(trimmed, entry.label);
    const onHint = entry.hint ? fuzzyMatch(trimmed, entry.hint) : null;
    if (!onLabel && !onHint) continue;
    // A label hit keeps its highlight; hint hits rank slightly lower.
    const score = Math.max(onLabel?.score ?? -Infinity, (onHint?.score ?? -Infinity) - 2);
    ranked.push({ entry, positions: onLabel?.positions ?? [], score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.map(({ entry, positions }) => ({ entry, positions }));
}
