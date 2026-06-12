import { describe, expect, it } from "vitest";
import {
  CHAT_MODELS,
  CLI_DEFAULT_MODEL,
  effectiveEffort,
  effortsFor,
  findModel,
  modelLabel,
  resolveAccess,
  supportsEffort,
  wireEffort,
} from "./chatModels";

describe("resolveAccess", () => {
  it("auto = read-only inside a project, chat outside", () => {
    expect(resolveAccess("auto", true)).toBe("read");
    expect(resolveAccess("auto", false)).toBe("chat");
  });

  it("explicit levels pass through", () => {
    expect(resolveAccess("full", false)).toBe("full");
    expect(resolveAccess("chat", true)).toBe("chat");
    expect(resolveAccess("read", false)).toBe("read");
  });
});

describe("model catalog", () => {
  it("every provider offers the CLI-default model first", () => {
    expect(CHAT_MODELS.anthropic[0].id).toBe(CLI_DEFAULT_MODEL);
    expect(CHAT_MODELS.openai[0].id).toBe(CLI_DEFAULT_MODEL);
  });

  it("findModel/modelLabel resolve known ids and fall back to the raw id", () => {
    expect(findModel("anthropic", "claude-opus-4-8")?.label).toBe("Opus 4.8");
    expect(modelLabel("anthropic", CLI_DEFAULT_MODEL)).toBe("Default");
    expect(modelLabel("anthropic", "claude-custom-x")).toBe("claude-custom-x");
  });
});

describe("effortsFor", () => {
  it("known models use their declared ladder", () => {
    expect(effortsFor("anthropic", "claude-haiku-4-5")).toEqual([]);
    expect(effortsFor("anthropic", "claude-opus-4-8")).toContain("ultracode");
  });

  it("custom claude ids fall back by family prefix", () => {
    expect(effortsFor("anthropic", "claude-haiku-9-9")).toEqual([]);
    expect(effortsFor("anthropic", "claude-fable-7")).toContain("xhigh");
    expect(effortsFor("anthropic", "claude-sonnet-4-6-20990101")).not.toContain("xhigh");
    expect(effortsFor("anthropic", "claude-something-new")).toEqual([
      "low",
      "medium",
      "high",
      "ultrathink",
    ]);
  });

  it("custom openai ids get the full openai ladder", () => {
    expect(effortsFor("openai", "gpt-9")).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
});

describe("effectiveEffort", () => {
  it("auto always stays auto", () => {
    expect(effectiveEffort("anthropic", "claude-haiku-4-5", "auto")).toBe("auto");
  });

  it("an effort the model rejects degrades to auto", () => {
    expect(effectiveEffort("anthropic", "claude-haiku-4-5", "max")).toBe("auto");
    expect(effectiveEffort("anthropic", "claude-sonnet-4-6", "xhigh")).toBe("auto");
  });

  it("an accepted effort is kept", () => {
    expect(effectiveEffort("anthropic", "claude-opus-4-8", "max")).toBe("max");
  });
});

describe("wireEffort", () => {
  it("auto omits the flag", () => {
    expect(wireEffort("anthropic", "auto")).toBeNull();
    expect(wireEffort("openai", "auto")).toBeNull();
  });

  it("claude: ultrathink rides the prompt (no flag), others pass through", () => {
    expect(wireEffort("anthropic", "ultrathink")).toBeNull();
    expect(wireEffort("anthropic", "max")).toBe("max");
    expect(wireEffort("anthropic", "low")).toBe("low");
  });

  it("codex: max tops out at xhigh", () => {
    expect(wireEffort("openai", "max")).toBe("xhigh");
    expect(wireEffort("openai", "high")).toBe("high");
  });
});

describe("supportsEffort", () => {
  it("models without a ladder report false", () => {
    expect(supportsEffort("anthropic", "claude-haiku-4-5")).toBe(false);
    expect(supportsEffort("openai", "gpt-5.3-codex-spark")).toBe(false);
    expect(supportsEffort("anthropic", "claude-opus-4-8")).toBe(true);
  });
});
