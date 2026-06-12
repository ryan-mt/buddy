import { describe, expect, it } from "vitest";
import {
  describeLinkChip,
  normalizeLinkUrl,
  splitLinkTokens,
  trimTrailingLinkPunctuation,
} from "./linkChips";

describe("trimTrailingLinkPunctuation", () => {
  it("strips sentence punctuation but keeps the URL body", () => {
    expect(trimTrailingLinkPunctuation("https://x.com.")).toBe("https://x.com");
    expect(trimTrailingLinkPunctuation("https://x.com/a?b=1!?")).toBe("https://x.com/a?b=1");
    expect(trimTrailingLinkPunctuation("https://x.com")).toBe("https://x.com");
  });
});

describe("normalizeLinkUrl", () => {
  it("keeps explicit http(s) URLs as-is", () => {
    expect(normalizeLinkUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com");
  });

  it("upgrades public-looking bare domains to https", () => {
    expect(normalizeLinkUrl("example.com")).toBe("https://example.com");
    expect(normalizeLinkUrl("docs.rs/serde")).toBe("https://docs.rs/serde");
    expect(normalizeLinkUrl("www.wikipedia.de")).toBe("https://www.wikipedia.de");
  });

  it("rejects file names that look like domains", () => {
    expect(normalizeLinkUrl("main.rs")).toBeNull();
    expect(normalizeLinkUrl("index.ts")).toBeNull();
    expect(normalizeLinkUrl("Cargo.toml")).toBeNull();
    expect(normalizeLinkUrl("notes.md")).toBeNull();
  });

  it("rejects unknown bare TLDs without a path", () => {
    expect(normalizeLinkUrl("foo.zz")).toBeNull();
  });

  it("rejects empty/garbage input", () => {
    expect(normalizeLinkUrl("")).toBeNull();
    expect(normalizeLinkUrl("...")).toBeNull();
  });
});

describe("splitLinkTokens", () => {
  it("plain text yields one text token", () => {
    expect(splitLinkTokens("hello world")).toEqual([{ kind: "text", text: "hello world" }]);
  });

  it("extracts a URL and keeps surrounding text", () => {
    const tokens = splitLinkTokens("see https://example.com for info");
    expect(tokens).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "https://example.com", url: "https://example.com" },
      { kind: "text", text: " for info" },
    ]);
  });

  it("keeps trailing sentence punctuation as text", () => {
    const tokens = splitLinkTokens("read https://example.com.");
    expect(tokens).toEqual([
      { kind: "text", text: "read " },
      { kind: "link", text: "https://example.com", url: "https://example.com" },
      { kind: "text", text: "." },
    ]);
  });

  it("skips file-like tokens entirely (text stays contiguous)", () => {
    const tokens = splitLinkTokens("edit main.rs then run");
    expect(tokens).toEqual([{ kind: "text", text: "edit main.rs then run" }]);
  });

  it("handles multiple links and bare domains together", () => {
    const tokens = splitLinkTokens("a example.com b https://x.dev/y c");
    expect(tokens.map((t) => t.kind)).toEqual(["text", "link", "text", "link", "text"]);
    expect(tokens[1].url).toBe("https://example.com");
    expect(tokens[3].url).toBe("https://x.dev/y");
  });

  it("does not treat an email's domain as a link", () => {
    const tokens = splitLinkTokens("mail me at user@example.com today");
    expect(tokens.every((t) => t.kind === "text")).toBe(true);
  });
});

describe("describeLinkChip", () => {
  it("shortens GitHub PRs/issues to owner/repo#n", () => {
    expect(describeLinkChip("https://github.com/foo/bar/pull/155")).toEqual({
      label: "foo/bar#155",
      isGitHub: true,
    });
    expect(describeLinkChip("https://github.com/foo/bar/issues/7")).toEqual({
      label: "foo/bar#7",
      isGitHub: true,
    });
  });

  it("shortens commits to owner/repo@sha7", () => {
    expect(describeLinkChip("https://github.com/foo/bar/commit/abcdef1234567890")).toEqual({
      label: "foo/bar@abcdef1",
      isGitHub: true,
    });
  });

  it("repo root and owner pages shorten cleanly", () => {
    expect(describeLinkChip("https://github.com/foo/bar")).toEqual({
      label: "foo/bar",
      isGitHub: true,
    });
    expect(describeLinkChip("https://github.com/foo")).toEqual({ label: "foo", isGitHub: true });
  });

  it("tree/blob GitHub URLs fall back to the globe label", () => {
    const chip = describeLinkChip("https://github.com/foo/bar/tree/main/src");
    expect(chip.isGitHub).toBe(false);
    expect(chip.label).toBe("github.com/foo/bar/tree/main/src");
  });

  it("non-GitHub URLs de-scheme and drop www + trailing slash", () => {
    expect(describeLinkChip("https://www.example.com/docs/")).toEqual({
      label: "example.com/docs",
      isGitHub: false,
    });
  });
});
