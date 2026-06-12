import { describe, expect, it } from "vitest";
import {
  clampRatio,
  computeLayout,
  firstLeaf,
  hasLeaf,
  leaf,
  leafIds,
  mapLeaves,
  ratioFromPointer,
  removeLeaf,
  replaceLeaf,
  setRatio,
  splitLeaf,
  type DividerRect,
  type PaneNode,
} from "./layout";

/** row(a | b) at ratio, with a fixed split id for assertions. */
function split(
  dir: "row" | "col",
  a: PaneNode,
  b: PaneNode,
  ratio = 0.5,
  id = "s1",
): PaneNode {
  return { kind: "split", id, dir, ratio, a, b };
}

describe("leaf queries", () => {
  it("firstLeaf walks document order and handles null", () => {
    expect(firstLeaf(null)).toBeNull();
    expect(firstLeaf(leaf("a"))).toBe("a");
    const tree = split("row", split("col", leaf("x"), leaf("y"), 0.5, "s2"), leaf("z"));
    expect(firstLeaf(tree)).toBe("x");
  });

  it("leafIds lists every session in document order", () => {
    expect(leafIds(null)).toEqual([]);
    const tree = split("row", split("col", leaf("x"), leaf("y"), 0.5, "s2"), leaf("z"));
    expect(leafIds(tree)).toEqual(["x", "y", "z"]);
  });

  it("hasLeaf finds nested leaves only", () => {
    const tree = split("row", leaf("a"), leaf("b"));
    expect(hasLeaf(tree, "a")).toBe(true);
    expect(hasLeaf(tree, "b")).toBe(true);
    expect(hasLeaf(tree, "c")).toBe(false);
    expect(hasLeaf(null, "a")).toBe(false);
  });
});

describe("splitLeaf", () => {
  it("replaces the target leaf with a 50/50 split keeping target as `a`", () => {
    const next = splitLeaf(leaf("a"), "a", "row", "b", "s1");
    expect(next).toEqual(split("row", leaf("a"), leaf("b"), 0.5, "s1"));
  });

  it("is a no-op when the target is absent", () => {
    const tree = split("row", leaf("a"), leaf("b"));
    expect(splitLeaf(tree, "missing", "col", "c", "s2")).toEqual(tree);
  });

  it("splits a nested leaf without touching siblings", () => {
    const tree = split("row", leaf("a"), leaf("b"));
    const next = splitLeaf(tree, "b", "col", "c", "s2");
    expect(next).toEqual(
      split("row", leaf("a"), split("col", leaf("b"), leaf("c"), 0.5, "s2")),
    );
  });
});

describe("removeLeaf", () => {
  it("removing the only leaf empties the tree", () => {
    expect(removeLeaf(leaf("a"), "a")).toBeNull();
  });

  it("collapses the split into the surviving sibling", () => {
    const tree = split("row", leaf("a"), leaf("b"));
    expect(removeLeaf(tree, "a")).toEqual(leaf("b"));
    expect(removeLeaf(tree, "b")).toEqual(leaf("a"));
  });

  it("collapses nested splits upward", () => {
    const tree = split("row", split("col", leaf("x"), leaf("y"), 0.5, "s2"), leaf("z"));
    expect(removeLeaf(tree, "y")).toEqual(split("row", leaf("x"), leaf("z")));
  });

  it("leaves the tree alone when the id is absent", () => {
    const tree = split("row", leaf("a"), leaf("b"));
    expect(removeLeaf(tree, "nope")).toEqual(tree);
  });
});

describe("replaceLeaf / mapLeaves", () => {
  it("replaceLeaf swaps the session in place", () => {
    const tree = split("row", leaf("a"), leaf("b"));
    expect(replaceLeaf(tree, "b", "c")).toEqual(split("row", leaf("a"), leaf("c")));
  });

  it("mapLeaves drops null-mapped leaves and collapses their split", () => {
    const tree = split("row", split("col", leaf("x"), leaf("y"), 0.5, "s2"), leaf("z"));
    const next = mapLeaves(tree, (id) => (id === "y" ? null : id.toUpperCase()));
    expect(next).toEqual(split("row", leaf("X"), leaf("Z")));
  });

  it("mapLeaves returns null when every leaf is dropped", () => {
    expect(mapLeaves(split("row", leaf("a"), leaf("b")), () => null)).toBeNull();
  });
});

describe("setRatio / clampRatio", () => {
  it("clamps into [0.08, 0.92]", () => {
    expect(clampRatio(0)).toBe(0.08);
    expect(clampRatio(1)).toBe(0.92);
    expect(clampRatio(0.5)).toBe(0.5);
  });

  it("setRatio targets one split by id and clamps", () => {
    const tree = split(
      "row",
      split("col", leaf("x"), leaf("y"), 0.5, "inner"),
      leaf("z"),
      0.5,
      "outer",
    );
    const next = setRatio(tree, "inner", 0.99);
    expect(next).toEqual(
      split("row", split("col", leaf("x"), leaf("y"), 0.92, "inner"), leaf("z"), 0.5, "outer"),
    );
  });
});

describe("computeLayout", () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };

  it("single leaf fills the rect with no dividers", () => {
    const { panes, dividers } = computeLayout(leaf("a"), rect, 4);
    expect(panes).toEqual([{ sessionId: "a", rect }]);
    expect(dividers).toEqual([]);
  });

  it("row split distributes width minus the gutter", () => {
    const { panes, dividers } = computeLayout(split("row", leaf("a"), leaf("b"), 0.25), rect, 4);
    // avail = 96, a gets 24, divider 4 wide, b gets 72.
    expect(panes).toEqual([
      { sessionId: "a", rect: { x: 0, y: 0, w: 24, h: 50 } },
      { sessionId: "b", rect: { x: 28, y: 0, w: 72, h: 50 } },
    ]);
    expect(dividers).toHaveLength(1);
    expect(dividers[0].rect).toEqual({ x: 24, y: 0, w: 4, h: 50 });
  });

  it("col split distributes height minus the gutter", () => {
    const { panes } = computeLayout(split("col", leaf("a"), leaf("b"), 0.5), rect, 10);
    expect(panes).toEqual([
      { sessionId: "a", rect: { x: 0, y: 0, w: 100, h: 20 } },
      { sessionId: "b", rect: { x: 0, y: 30, w: 100, h: 20 } },
    ]);
  });

  it("a rect narrower than the gutter never yields negative sizes", () => {
    const { panes } = computeLayout(
      split("row", leaf("a"), leaf("b")),
      { x: 0, y: 0, w: 2, h: 10 },
      4,
    );
    for (const p of panes) {
      expect(p.rect.w).toBeGreaterThanOrEqual(0);
      expect(p.rect.h).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ratioFromPointer", () => {
  const divider: DividerRect = {
    splitId: "s1",
    dir: "row",
    rect: { x: 48, y: 0, w: 4, h: 50 },
    parentRect: { x: 0, y: 0, w: 100, h: 50 },
  };

  it("maps a pointer x back into the ratio for row splits", () => {
    expect(ratioFromPointer(divider, 48, 0)).toBeCloseTo(0.5);
    expect(ratioFromPointer(divider, 0, 0)).toBe(0.08); // clamped
    expect(ratioFromPointer(divider, 200, 0)).toBe(0.92); // clamped
  });

  it("falls back to 0.5 when the parent has no usable space", () => {
    const degenerate: DividerRect = {
      ...divider,
      rect: { x: 0, y: 0, w: 4, h: 50 },
      parentRect: { x: 0, y: 0, w: 4, h: 50 },
    };
    expect(ratioFromPointer(degenerate, 10, 0)).toBe(0.5);
  });
});
