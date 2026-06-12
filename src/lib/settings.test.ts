import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  getInitialSettings,
  sanitizeSettings,
  saveSettings,
} from "./settings";

describe("sanitizeSettings", () => {
  it("empty payload yields the defaults", () => {
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps numeric fields into their ranges", () => {
    expect(sanitizeSettings({ terminalFontSize: 99 }).terminalFontSize).toBe(FONT_SIZE_MAX);
    expect(sanitizeSettings({ terminalFontSize: 1 }).terminalFontSize).toBe(FONT_SIZE_MIN);
    expect(sanitizeSettings({ terminalFontSize: 14.6 }).terminalFontSize).toBe(15);
    expect(sanitizeSettings({ terminalScrollback: 50 }).terminalScrollback).toBe(1000);
  });

  it("rejects wrong-typed fields field-by-field", () => {
    const out = sanitizeSettings({
      terminalFontSize: "big" as unknown as number,
      terminalCursorStyle: "wave" as never,
      confirmClose: "yes" as unknown as boolean,
      restoreOnLaunch: "maybe" as never,
    });
    expect(out.terminalFontSize).toBe(DEFAULT_SETTINGS.terminalFontSize);
    expect(out.terminalCursorStyle).toBe(DEFAULT_SETTINGS.terminalCursorStyle);
    expect(out.confirmClose).toBe(DEFAULT_SETTINGS.confirmClose);
    expect(out.restoreOnLaunch).toBe(DEFAULT_SETTINGS.restoreOnLaunch);
  });

  it("keeps valid values", () => {
    const out = sanitizeSettings({
      terminalCursorStyle: "bar",
      restoreOnLaunch: "always",
      notifications: false,
      defaultEffort: "max",
    });
    expect(out.terminalCursorStyle).toBe("bar");
    expect(out.restoreOnLaunch).toBe("always");
    expect(out.notifications).toBe(false);
    expect(out.defaultEffort).toBe("max");
  });
});

describe("settings persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage", () => {
    saveSettings({ ...DEFAULT_SETTINGS, terminalFontSize: 16 });
    expect(getInitialSettings().terminalFontSize).toBe(16);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("buddy-settings", "{not json");
    expect(getInitialSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
