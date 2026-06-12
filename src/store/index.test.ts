// Store behavior tests: session lifecycle, split layout transitions, the
// prompt queue, formations, and workspace restore. Tauri IPC is mocked at the
// `invoke` boundary so `lib/bindings.ts` runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() =>
  vi.fn(async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => []),
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage: unknown = null;
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    requestUserAttention: vi.fn(async () => {}),
    setAlwaysOnTop: vi.fn(async () => {}),
  }),
  UserAttentionType: { Critical: 1, Informational: 2 },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

import { useApp, basename, errorMessage } from "./index";
import { leafIds } from "../lib/layout";

/** Calls to one IPC command, as their args objects. */
function callsTo(cmd: string): Record<string, unknown>[] {
  return invokeMock.mock.calls.filter((c) => c[0] === cmd).map((c) => c[1] ?? {});
}

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockClear();
  useApp.setState(useApp.getInitialState(), true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("helpers", () => {
  it("basename handles both slash styles", () => {
    expect(basename("C:\\Users\\me\\proj")).toBe("proj");
    expect(basename("/home/me/proj/")).toBe("proj");
    expect(basename("plain")).toBe("plain");
  });

  it("errorMessage unwraps AppError-shaped objects", () => {
    expect(errorMessage({ code: "x", message: "boom" })).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});

describe("launch & layout", () => {
  it("launch adds a session as the sole visible leaf and closes overlays", () => {
    useApp.getState().openModal({});
    useApp.getState().launch({ cli: "claude", cwd: "C:\\repo\\app" });
    const s = useApp.getState();
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].title).toBe("app"); // derived from cwd
    expect(s.sessions[0].titleAuto).toBe(true);
    expect(s.layout).toEqual({ kind: "leaf", sessionId: s.sessions[0].id });
    expect(s.activeId).toBe(s.sessions[0].id);
    expect(s.modal).toBeNull();
  });

  it("launching from a split modal context splits the target pane", () => {
    useApp.getState().launch({ cli: "claude" });
    const first = useApp.getState().sessions[0].id;
    useApp.getState().openModal({ splitDir: "row", splitTarget: first });
    useApp.getState().launch({ cli: "codex" });
    const s = useApp.getState();
    expect(s.sessions).toHaveLength(2);
    expect(s.layout?.kind).toBe("split");
    expect(leafIds(s.layout)).toEqual([first, s.sessions[1].id]);
    expect(s.activeId).toBe(s.sessions[1].id);
  });

  it("closing one side of a split collapses to the sibling", () => {
    useApp.getState().launch({ cli: "claude" });
    const first = useApp.getState().sessions[0].id;
    useApp.getState().openModal({ splitDir: "row", splitTarget: first });
    useApp.getState().launch({ cli: "codex" });
    const second = useApp.getState().sessions[1].id;

    useApp.getState().closeSession(second);
    const s = useApp.getState();
    expect(s.sessions.map((t) => t.id)).toEqual([first]);
    expect(s.layout).toEqual({ kind: "leaf", sessionId: first });
    expect(s.activeId).toBe(first);
  });

  it("requestClose asks first for a running session, closes an exited one", () => {
    useApp.getState().launch({ cli: "claude" });
    const id = useApp.getState().sessions[0].id;

    useApp.getState().requestClose(id);
    expect(useApp.getState().confirmCloseId).toBe(id); // confirmClose defaults on
    useApp.getState().cancelClose();

    useApp.getState().markExited(id, 0);
    useApp.getState().requestClose(id);
    expect(useApp.getState().sessions).toHaveLength(0);
  });

  it("selectSession shows a hidden session alone and clears its attention flag", () => {
    useApp.getState().launch({ cli: "claude" });
    const a = useApp.getState().sessions[0].id;
    useApp.getState().launch({ cli: "codex" }); // replaces the visible layout
    useApp.setState({ activity: { [a]: "attention" } });

    useApp.getState().selectSession(a);
    const s = useApp.getState();
    expect(s.layout).toEqual({ kind: "leaf", sessionId: a });
    expect(s.activity[a]).toBeUndefined();
  });

  it("relaunch replaces the exited pane in place and resumes claude", () => {
    useApp.getState().launch({ cli: "claude" });
    const id = useApp.getState().sessions[0].id;
    useApp.getState().setPtyId(id, "pty-1");
    useApp.getState().relaunch(id); // still running — no-op
    expect(useApp.getState().sessions[0].id).toBe(id);

    useApp.getState().markExited(id, 1);
    useApp.getState().relaunch(id);
    const fresh = useApp.getState().sessions[0];
    expect(fresh.id).not.toBe(id);
    expect(fresh.exited).toBe(false);
    expect(fresh.resumeId).toBe("pty-1");
    expect(useApp.getState().layout).toEqual({ kind: "leaf", sessionId: fresh.id });
  });

  it("toggleZoom only zooms while split", () => {
    useApp.getState().launch({ cli: "claude" });
    useApp.getState().toggleZoom();
    expect(useApp.getState().zoomedId).toBeNull();

    const first = useApp.getState().sessions[0].id;
    useApp.getState().openModal({ splitDir: "col", splitTarget: first });
    useApp.getState().launch({ cli: "codex" });
    useApp.getState().toggleZoom();
    expect(useApp.getState().zoomedId).toBe(useApp.getState().activeId);
    useApp.getState().toggleZoom();
    expect(useApp.getState().zoomedId).toBeNull();
  });
});

describe("session order, cycling & window pin", () => {
  it("cycleSession wraps both ways and lands on the cli view", () => {
    useApp.getState().launch({ cli: "claude" });
    useApp.getState().launch({ cli: "codex" });
    useApp.getState().launch({ cli: "gemini" });
    const [a, b, c] = useApp.getState().sessions.map((s) => s.id);
    expect(useApp.getState().activeId).toBe(c);

    useApp.setState({ view: "chat" });
    useApp.getState().cycleSession(1); // wraps c → a
    expect(useApp.getState().activeId).toBe(a);
    expect(useApp.getState().view).toBe("cli");

    useApp.getState().cycleSession(-1); // back around a → c
    expect(useApp.getState().activeId).toBe(c);
    useApp.getState().cycleSession(-1);
    expect(useApp.getState().activeId).toBe(b);
  });

  it("moveSession reorders, clamps, and ignores unknown ids", () => {
    useApp.getState().launch({ cli: "claude" });
    useApp.getState().launch({ cli: "codex" });
    useApp.getState().launch({ cli: "gemini" });
    const [a, b, c] = useApp.getState().sessions.map((s) => s.id);

    useApp.getState().moveSession(c, 0);
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual([c, a, b]);

    useApp.getState().moveSession(c, 99); // clamps to the end
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual([a, b, c]);

    useApp.getState().moveSession("ghost", 0);
    expect(useApp.getState().sessions.map((s) => s.id)).toEqual([a, b, c]);
  });

  it("toggleAlwaysOnTop flips the flag once the window call lands", async () => {
    useApp.getState().toggleAlwaysOnTop();
    await vi.waitFor(() => expect(useApp.getState().alwaysOnTop).toBe(true));
    useApp.getState().toggleAlwaysOnTop();
    await vi.waitFor(() => expect(useApp.getState().alwaysOnTop).toBe(false));
  });

  it("toggleSidebar persists through settings", () => {
    expect(useApp.getState().settings.sidebarCollapsed).toBe(false);
    useApp.getState().toggleSidebar();
    expect(useApp.getState().settings.sidebarCollapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem("buddy-settings")!).sidebarCollapsed).toBe(true);
  });
});

describe("rename & auto-title", () => {
  it("renameSession trims, ignores empty, and pins the title", () => {
    useApp.getState().launch({ cli: "claude" });
    const id = useApp.getState().sessions[0].id;

    useApp.getState().renameSession(id, "   ");
    expect(useApp.getState().sessions[0].titleAuto).toBe(true);

    useApp.getState().renameSession(id, "  my run  ");
    const tab = useApp.getState().sessions[0];
    expect(tab.title).toBe("my run");
    expect(tab.titleAuto).toBe(false);
  });

  it("autoTitle collapses whitespace, caps at 48 chars, fires once", () => {
    useApp.getState().launch({ cli: "claude" });
    const id = useApp.getState().sessions[0].id;

    useApp.getState().autoTitle(id, "abc"); // too short
    expect(useApp.getState().sessions[0].titleAuto).toBe(true);

    useApp.getState().autoTitle(id, "  fix   the\nbug in " + "x".repeat(60));
    const title = useApp.getState().sessions[0].title;
    expect(title.startsWith("fix the bug in")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(48);

    useApp.getState().autoTitle(id, "a totally different prompt");
    expect(useApp.getState().sessions[0].title).toBe(title); // pinned now
  });
});

describe("prompt queue", () => {
  function launchLive(): string {
    useApp.getState().launch({ cli: "claude" });
    const id = useApp.getState().sessions[useApp.getState().sessions.length - 1].id;
    useApp.getState().setPtyId(id, `pty-${id.slice(0, 4)}`);
    return id;
  }

  it("sendPrompt writes to an idle pane with bracketed paste + submit", () => {
    const id = launchLive();
    useApp.getState().sendPrompt("hello agent", "active");
    const writes = callsTo("write_terminal");
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toBe("\x1b[200~hello agent\x1b[201~\r");
    expect(writes[0].id).toBe(useApp.getState().sessions.find((s) => s.id === id)!.ptyId);
  });

  it("sendPrompt with no running pane toasts an error", () => {
    useApp.getState().sendPrompt("anyone?", "active");
    expect(useApp.getState().toasts.some((t) => t.kind === "error")).toBe(true);
  });

  it("a busy pane queues the prompt and delivers it when output settles", () => {
    vi.useFakeTimers();
    const id = launchLive();
    useApp.getState().reportOutput(id); // mark busy
    expect(useApp.getState().activity[id]).toBe("busy");

    useApp.getState().sendPrompt("queued work", "active");
    expect(callsTo("write_terminal")).toHaveLength(0);
    expect(useApp.getState().queued[id]).toEqual(["queued work"]);

    vi.advanceTimersByTime(2600); // idle threshold passes
    expect(useApp.getState().activity[id]).toBeUndefined();
    const writes = callsTo("write_terminal");
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toContain("queued work");
    expect(useApp.getState().queued[id]).toBeUndefined();
  });

  it("only one queued prompt is released per lull", () => {
    vi.useFakeTimers();
    const id = launchLive();
    useApp.getState().reportOutput(id);
    useApp.getState().sendPrompt("first", "active");
    useApp.getState().sendPrompt("second", "active");
    expect(useApp.getState().queued[id]).toEqual(["first", "second"]);

    vi.advanceTimersByTime(2600);
    expect(callsTo("write_terminal")).toHaveLength(1);
    expect(useApp.getState().queued[id]).toEqual(["second"]);
  });

  it("markExited drops the session's queue", () => {
    vi.useFakeTimers();
    const id = launchLive();
    useApp.getState().reportOutput(id);
    useApp.getState().sendPrompt("never lands", "active");
    useApp.getState().markExited(id, 0);
    expect(useApp.getState().queued[id]).toBeUndefined();

    vi.advanceTimersByTime(5000);
    expect(callsTo("write_terminal")).toHaveLength(0);
  });

  it('"all" targets every visible running pane, not hidden ones', () => {
    const a = launchLive();
    useApp.getState().openModal({ splitDir: "row", splitTarget: a });
    useApp.getState().launch({ cli: "codex" });
    const b = useApp.getState().sessions[useApp.getState().sessions.length - 1].id;
    useApp.getState().setPtyId(b, "pty-b");
    launchLive(); // third session replaces the layout → a & b hidden

    invokeMock.mockClear();
    useApp.getState().sendPrompt("to the visible one", "all");
    expect(callsTo("write_terminal")).toHaveLength(1);
  });
});

describe("activity & broadcast", () => {
  it("reportBell flags attention only for unfocused panes", () => {
    useApp.getState().launch({ cli: "claude" });
    const a = useApp.getState().sessions[0].id;
    useApp.getState().reportBell(a); // a is active — ignored
    expect(useApp.getState().activity[a]).toBeUndefined();

    useApp.getState().launch({ cli: "codex" });
    useApp.getState().reportBell(a);
    expect(useApp.getState().activity[a]).toBe("attention");
  });

  it("broadcast only arms on a split and writes to visible live panes", () => {
    useApp.getState().launch({ cli: "claude" });
    const a = useApp.getState().sessions[0].id;
    useApp.getState().setPtyId(a, "pty-a");
    useApp.getState().toggleBroadcast(); // single pane — refused
    expect(useApp.getState().broadcast).toBe(false);

    useApp.getState().openModal({ splitDir: "row", splitTarget: a });
    useApp.getState().launch({ cli: "codex" });
    const b = useApp.getState().sessions[1].id;
    useApp.getState().setPtyId(b, "pty-b");
    useApp.getState().toggleBroadcast();
    expect(useApp.getState().broadcast).toBe(true);

    invokeMock.mockClear();
    useApp.getState().markExited(b, 0); // dead pane must not receive keys
    useApp.getState().broadcastWrite("x");
    const writes = callsTo("write_terminal");
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe("pty-a");
  });
});

describe("pulse & attention jumps", () => {
  it("jumpToAttention with nobody waiting just toasts", () => {
    useApp.getState().launch({ cli: "claude" });
    useApp.getState().jumpToAttention();
    const s = useApp.getState();
    expect(s.toasts.some((t) => t.message.includes("No agent"))).toBe(true);
    expect(s.activeId).toBe(s.sessions[0].id);
  });

  it("jumpToAttention cycles through waiting sessions, acknowledging each", () => {
    useApp.getState().launch({ cli: "claude" });
    const a = useApp.getState().sessions[0].id;
    useApp.getState().launch({ cli: "codex" });
    const b = useApp.getState().sessions[1].id;
    useApp.getState().launch({ cli: "gemini" });
    const c = useApp.getState().sessions[2].id; // active
    useApp.setState({ activity: { [a]: "attention", [b]: "attention" } });

    useApp.getState().jumpToAttention(); // wraps past c → a
    expect(useApp.getState().activeId).toBe(a);
    expect(useApp.getState().activity[a]).toBeUndefined(); // visiting acked it

    useApp.getState().jumpToAttention();
    expect(useApp.getState().activeId).toBe(b);

    useApp.getState().jumpToAttention(); // nobody left
    expect(useApp.getState().activeId).toBe(b);
    expect(c).not.toBe(useApp.getState().activeId);
  });

  it("jumping closes the Pulse overlay and lands on the cli view", () => {
    useApp.getState().launch({ cli: "claude" });
    useApp.getState().launch({ cli: "codex" });
    const a = useApp.getState().sessions[0].id;
    useApp.setState({
      activity: { [a]: "attention" },
      pulseOpen: true,
      view: "chat",
    });

    useApp.getState().jumpToAttention();
    const s = useApp.getState();
    expect(s.activeId).toBe(a);
    expect(s.pulseOpen).toBe(false); // selectSession closes the overlay
    expect(s.view).toBe("cli");
  });

  it("launching a session closes the Pulse overlay", () => {
    useApp.setState({ pulseOpen: true });
    useApp.getState().launch({ cli: "claude" });
    expect(useApp.getState().pulseOpen).toBe(false);
  });
});

describe("formations", () => {
  it("save + launch round-trips the split tree and slot configs", () => {
    useApp.getState().launch({ cli: "claude", model: "opus" });
    const a = useApp.getState().sessions[0].id;
    useApp.getState().openModal({ splitDir: "row", splitTarget: a });
    useApp.getState().launch({ cli: "codex", model: "gpt-5.4" });

    useApp.getState().saveFormation("pair");
    const formation = useApp.getState().formations.find((f) => f.name === "pair");
    expect(formation).toBeDefined();
    expect(formation!.slots.map((s) => s.cli)).toEqual(["claude", "codex"]);

    const before = useApp.getState().sessions.length;
    useApp.getState().launchFormation(formation!.id);
    const s = useApp.getState();
    expect(s.sessions).toHaveLength(before + 2);
    const fresh = s.sessions.slice(-2);
    expect(fresh.map((t) => t.cli)).toEqual(["claude", "codex"]);
    expect(fresh.map((t) => t.model)).toEqual(["opus", "gpt-5.4"]);
    expect(s.layout?.kind).toBe("split");
    expect(leafIds(s.layout)).toEqual(fresh.map((t) => t.id));
  });

  it("saveFormation without a layout is a no-op", () => {
    useApp.getState().saveFormation("empty");
    expect(useApp.getState().formations).toHaveLength(0);
  });

  it("removeFormation deletes and persists", () => {
    useApp.getState().launch({ cli: "claude" });
    useApp.getState().saveFormation("solo");
    const id = useApp.getState().formations[0].id;
    useApp.getState().removeFormation(id);
    expect(useApp.getState().formations).toHaveLength(0);
  });
});

describe("workspace restore", () => {
  it("restores tabs with fresh ids, resuming claude via the old ptyId", () => {
    useApp.setState({
      restorable: {
        sessions: [
          {
            id: "old-a",
            title: "claude one",
            cli: "claude",
            ptyId: "pty-old",
            exited: false,
          },
          { id: "old-b", title: "codex one", cli: "codex", exited: false },
        ],
        layout: {
          kind: "split",
          id: "s",
          dir: "row",
          ratio: 0.4,
          a: { kind: "leaf", sessionId: "old-a" },
          b: { kind: "leaf", sessionId: "old-b" },
        },
      },
    });

    useApp.getState().restoreWorkspace();
    const s = useApp.getState();
    expect(s.restorable).toBeNull();
    expect(s.sessions).toHaveLength(2);
    const [a, b] = s.sessions;
    expect(a.id).not.toBe("old-a");
    expect(a.resumeId).toBe("pty-old"); // claude resumes
    expect(a.ptyId).toBeUndefined();
    expect(b.resumeId).toBeUndefined(); // codex relaunches clean
    expect(s.layout?.kind).toBe("split");
    expect(leafIds(s.layout)).toEqual([a.id, b.id]);
    expect(s.activeId).toBe(a.id);
  });

  it("dismissRestore clears the offer and the stored snapshot", () => {
    useApp.setState({
      restorable: { sessions: [], layout: null },
    });
    useApp.getState().dismissRestore();
    expect(useApp.getState().restorable).toBeNull();
    expect(localStorage.getItem("buddy-workspace")).toBeNull();
  });
});
