// localStorage round-trips for the small persisted collections: formations,
// snippets, chat prefs, and the workspace snapshot.
import { beforeEach, describe, expect, it } from "vitest";
import { loadFormations, saveFormations, type Formation } from "./formations";
import { loadSnippets, saveSnippets } from "./snippets";
import { loadChatPrefs, saveChatPrefs } from "./chatPrefs";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "./snapshot";
import { leaf } from "./layout";
import type { SessionTab } from "../types";

beforeEach(() => localStorage.clear());

describe("formations", () => {
  const formation: Formation = {
    id: "f1",
    name: "duo",
    layout: { kind: "split", id: "s", dir: "row", ratio: 0.5, a: leaf("0"), b: leaf("1") },
    slots: [{ cli: "claude" }, { cli: "codex", model: "gpt-5.4" }],
  };

  it("round-trips", () => {
    saveFormations([formation]);
    expect(loadFormations()).toEqual([formation]);
  });

  it("corrupt or non-array payloads load as empty", () => {
    localStorage.setItem("buddy-formations", "{not json");
    expect(loadFormations()).toEqual([]);
    localStorage.setItem("buddy-formations", '{"a":1}');
    expect(loadFormations()).toEqual([]);
  });
});

describe("snippets", () => {
  it("round-trips and tolerates corruption", () => {
    saveSnippets([{ id: "1", text: "run the tests" }]);
    expect(loadSnippets()).toEqual([{ id: "1", text: "run the tests" }]);
    localStorage.setItem("buddy-snippets", "[broken");
    expect(loadSnippets()).toEqual([]);
  });
});

describe("chat prefs", () => {
  it("round-trips a full prefs object", () => {
    saveChatPrefs({ provider: "openai", model: "gpt-5.4", effort: "high", access: "read" });
    expect(loadChatPrefs()).toEqual({
      provider: "openai",
      model: "gpt-5.4",
      effort: "high",
      access: "read",
    });
  });

  it('model "" (CLI default) is preserved', () => {
    saveChatPrefs({ provider: "anthropic", model: "", effort: "auto", access: "auto" });
    expect(loadChatPrefs().model).toBe("");
  });

  it("invalid enum values degrade to auto / defaults", () => {
    localStorage.setItem(
      "buddy-chat-model",
      JSON.stringify({ provider: "anthropic", model: "x", effort: "warp", access: "root" }),
    );
    expect(loadChatPrefs()).toEqual({
      provider: "anthropic",
      model: "x",
      effort: "auto",
      access: "auto",
    });
  });

  it("unknown provider falls back entirely to defaults", () => {
    localStorage.setItem(
      "buddy-chat-model",
      JSON.stringify({ provider: "gemini", model: "pro" }),
    );
    expect(loadChatPrefs().provider).toBe("anthropic");
  });
});

describe("workspace snapshot", () => {
  const tab: SessionTab = {
    id: "t1",
    title: "demo",
    cli: "claude",
    exited: false,
    startedAt: 1,
  };

  it("round-trips sessions + layout", () => {
    saveSnapshot({ sessions: [tab], layout: leaf("t1") });
    expect(loadSnapshot()).toEqual({ sessions: [tab], layout: leaf("t1") });
  });

  it("an empty workspace clears the stored snapshot", () => {
    saveSnapshot({ sessions: [tab], layout: leaf("t1") });
    saveSnapshot({ sessions: [], layout: null });
    expect(loadSnapshot()).toBeNull();
  });

  it("clearSnapshot drops it and corruption loads as null", () => {
    saveSnapshot({ sessions: [tab], layout: leaf("t1") });
    clearSnapshot();
    expect(loadSnapshot()).toBeNull();
    localStorage.setItem("buddy-workspace", "...");
    expect(loadSnapshot()).toBeNull();
  });
});
