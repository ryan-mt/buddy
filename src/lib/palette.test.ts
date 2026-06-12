import { describe, expect, it } from "vitest";
import { fuzzyMatch, rankEntries, type PaletteEntry } from "./palette";

describe("fuzzyMatch", () => {
  it("empty query matches everything with zero score", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, positions: [] });
  });

  it("requires the query as an in-order subsequence", () => {
    expect(fuzzyMatch("nss", "New session")).not.toBeNull();
    expect(fuzzyMatch("xyz", "New session")).toBeNull();
    expect(fuzzyMatch("noisses", "New session")).toBeNull(); // right chars, wrong order
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("NEW", "new session")).not.toBeNull();
    expect(fuzzyMatch("new", "NEW SESSION")).not.toBeNull();
  });

  it("queries longer than the text never match", () => {
    expect(fuzzyMatch("settings!", "set")).toBeNull();
  });

  it("prefers word-start anchors for highlighting", () => {
    // "s" should anchor at the start of "session", not inside "new".
    const m = fuzzyMatch("s", "new session")!;
    expect(m.positions).toEqual([4]);
  });

  it("word-start lookahead never breaks a match that still fits plainly", () => {
    // After taking "se" the remaining "ttings" must match — lookahead may not
    // jump somewhere that leaves too little room.
    expect(fuzzyMatch("settings", "settings")).not.toBeNull();
    expect(fuzzyMatch("ses", "session s")).not.toBeNull();
  });

  it("scores exact prefixes above scattered matches", () => {
    const prefix = fuzzyMatch("set", "Settings")!;
    const scattered = fuzzyMatch("set", "Save the report")!;
    expect(prefix.score).toBeGreaterThan(scattered.score);
  });

  it("scores word-boundary acronyms above mid-word hits", () => {
    const acronym = fuzzyMatch("ns", "New session")!;
    const midword = fuzzyMatch("ns", "intensity")!;
    expect(acronym.score).toBeGreaterThan(midword.score);
  });
});

describe("rankEntries", () => {
  const make = (id: string, label: string, hint?: string): PaletteEntry => ({
    id,
    label,
    hint,
    section: "test",
    run: () => {},
  });

  it("empty query returns all entries in original order", () => {
    const entries = [make("a", "Bravo"), make("b", "Alpha")];
    expect(rankEntries(entries, "  ").map((r) => r.entry.id)).toEqual(["a", "b"]);
  });

  it("filters non-matches and sorts by score", () => {
    const entries = [
      make("scatter", "Strange esoteric thing"),
      make("exact", "Settings"),
      make("none", "Quit"),
    ];
    const ranked = rankEntries(entries, "set");
    expect(ranked.map((r) => r.entry.id)).toEqual(["exact", "scatter"]);
  });

  it("matches on the hint when the label misses", () => {
    const entries = [make("p", "my-app", "project C:\\repos\\my-app")];
    const ranked = rankEntries(entries, "repos");
    expect(ranked).toHaveLength(1);
    expect(ranked[0].positions).toEqual([]); // hint matched — no label highlight
  });

  it("label matches outrank hint-only matches", () => {
    const entries = [
      make("hint-only", "Other thing", "switch panes"),
      make("label", "Switch to pane"),
    ];
    expect(rankEntries(entries, "switch")[0].entry.id).toBe("label");
  });

  it("returns label highlight positions for the UI", () => {
    const ranked = rankEntries([make("a", "New session")], "ns");
    expect(ranked[0].positions).toEqual([0, 4]);
  });
});
