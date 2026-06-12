import { describe, expect, it } from "vitest";
import { describeBackup, parseBackup, serializeBackup, type BackupData } from "./backup";
import { DEFAULT_SETTINGS } from "./settings";
import { leaf } from "./layout";

const sample: BackupData = {
  settings: { ...DEFAULT_SETTINGS, terminalFontSize: 15 },
  theme: "light",
  snippets: [{ id: "s1", text: "run the tests" }],
  formations: [
    {
      id: "f1",
      name: "pair",
      layout: { kind: "split", id: "x", dir: "row", ratio: 0.5, a: leaf("0"), b: leaf("1") },
      slots: [{ cli: "claude" }, { cli: "codex", model: "gpt-5.4" }],
    },
  ],
  chatPrefs: { provider: "openai", model: "", effort: "high", access: "auto" },
};

describe("serialize → parse round-trip", () => {
  it("returns the exact same data", () => {
    const json = serializeBackup(sample, new Date("2026-06-11T10:00:00Z"));
    expect(JSON.parse(json).savedAt).toBe("2026-06-11T10:00:00.000Z");
    expect(parseBackup(json)).toEqual(sample);
  });
});

describe("parseBackup rejection", () => {
  it("rejects non-JSON", () => {
    expect(() => parseBackup("{nope")).toThrow("Not a valid JSON file");
  });

  it("rejects JSON that isn't a buddy backup", () => {
    expect(() => parseBackup('{"app":"other"}')).toThrow("Not a buddy backup file");
    expect(() => parseBackup('["array"]')).toThrow("Not a buddy backup file");
  });

  it("rejects unknown versions", () => {
    expect(() => parseBackup('{"app":"buddy","backupVersion":99}')).toThrow(
      "Unsupported backup version",
    );
  });
});

describe("parseBackup degradation", () => {
  const minimal = '{"app":"buddy","backupVersion":1}';

  it("missing sections fall back to defaults / empty", () => {
    const data = parseBackup(minimal);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.theme).toBe("dark");
    expect(data.snippets).toEqual([]);
    expect(data.formations).toEqual([]);
    expect(data.chatPrefs.provider).toBe("anthropic");
  });

  it("invalid settings values clamp instead of failing", () => {
    const data = parseBackup(
      '{"app":"buddy","backupVersion":1,"settings":{"terminalFontSize":999,"confirmClose":"x"}}',
    );
    expect(data.settings.terminalFontSize).toBe(20);
    expect(data.settings.confirmClose).toBe(DEFAULT_SETTINGS.confirmClose);
  });

  it("malformed snippets are dropped, valid ones kept", () => {
    const data = parseBackup(
      `{"app":"buddy","backupVersion":1,"snippets":[{"id":"a","text":"ok"},{"id":1,"text":"bad id"},{"id":"b","text":"  "},"junk"]}`,
    );
    expect(data.snippets).toEqual([{ id: "a", text: "ok" }]);
  });

  it("a formation with an unknown cli or broken tree is dropped", () => {
    const good = sample.formations[0];
    const badCli = { ...good, id: "f2", slots: [{ cli: "skynet" }] };
    const badTree = { ...good, id: "f3", layout: { kind: "leaf", sessionId: "7" } }; // slot 7 of 2
    const json = JSON.stringify({
      app: "buddy",
      backupVersion: 1,
      formations: [good, badCli, badTree],
    });
    const data = parseBackup(json);
    expect(data.formations.map((f) => f.id)).toEqual(["f1"]);
  });

  it("a formation tree ratio outside (0,1) is rejected", () => {
    const broken = {
      ...sample.formations[0],
      layout: { kind: "split", id: "x", dir: "row", ratio: 7, a: leaf("0"), b: leaf("1") },
    };
    const json = JSON.stringify({ app: "buddy", backupVersion: 1, formations: [broken] });
    expect(parseBackup(json).formations).toEqual([]);
  });

  it("unknown theme falls back to dark", () => {
    const data = parseBackup('{"app":"buddy","backupVersion":1,"theme":"hotdog"}');
    expect(data.theme).toBe("dark");
  });
});

describe("describeBackup", () => {
  it("summarizes counts with plurals", () => {
    expect(describeBackup(sample)).toBe("1 formation, 1 snippet, settings, light theme");
    expect(describeBackup({ ...sample, snippets: [], formations: [] })).toBe(
      "0 formations, 0 snippets, settings, light theme",
    );
  });
});
