// Pure layout-tree logic for tmux-style split panes. Kept side-effect free so
// the geometry math stays easy to reason about (and could be unit-tested).
//
// A layout is a binary tree: a `leaf` holds one session, a `split` divides its
// area between two children along `dir` at `ratio` (the fraction given to `a`).

export type Dir = "row" | "col";

export type PaneNode =
  | { kind: "leaf"; sessionId: string }
  | { kind: "split"; id: string; dir: Dir; ratio: number; a: PaneNode; b: PaneNode };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaneRect {
  sessionId: string;
  rect: Rect;
}

export interface DividerRect {
  splitId: string;
  dir: Dir;
  /** The thin strip the user grabs. */
  rect: Rect;
  /** Area being divided — used to convert a pointer position back into a ratio. */
  parentRect: Rect;
}

const MIN_RATIO = 0.08;
const MAX_RATIO = 0.92;

export function leaf(sessionId: string): PaneNode {
  return { kind: "leaf", sessionId };
}

export function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/** First leaf in document order, or null for an empty tree. */
export function firstLeaf(node: PaneNode | null): string | null {
  if (!node) return null;
  if (node.kind === "leaf") return node.sessionId;
  return firstLeaf(node.a) ?? firstLeaf(node.b);
}

/** All leaf session ids in document order. */
export function leafIds(node: PaneNode | null): string[] {
  if (!node) return [];
  if (node.kind === "leaf") return [node.sessionId];
  return [...leafIds(node.a), ...leafIds(node.b)];
}

export function hasLeaf(node: PaneNode | null, sessionId: string): boolean {
  if (!node) return false;
  if (node.kind === "leaf") return node.sessionId === sessionId;
  return hasLeaf(node.a, sessionId) || hasLeaf(node.b, sessionId);
}

/**
 * Replace the leaf holding `targetSessionId` with a split that keeps it as `a`
 * and adds `newSessionId` as `b`. No-op if the target leaf is absent.
 */
export function splitLeaf(
  node: PaneNode,
  targetSessionId: string,
  dir: Dir,
  newSessionId: string,
  splitId: string,
): PaneNode {
  if (node.kind === "leaf") {
    if (node.sessionId !== targetSessionId) return node;
    return { kind: "split", id: splitId, dir, ratio: 0.5, a: node, b: leaf(newSessionId) };
  }
  return {
    ...node,
    a: splitLeaf(node.a, targetSessionId, dir, newSessionId, splitId),
    b: splitLeaf(node.b, targetSessionId, dir, newSessionId, splitId),
  };
}

/** Remove a leaf, collapsing the now-only-child split into its sibling. */
export function removeLeaf(node: PaneNode | null, sessionId: string): PaneNode | null {
  if (!node) return null;
  if (node.kind === "leaf") return node.sessionId === sessionId ? null : node;
  const a = removeLeaf(node.a, sessionId);
  const b = removeLeaf(node.b, sessionId);
  if (!a) return b;
  if (!b) return a;
  return { ...node, a, b };
}

/** Swap one leaf's session for another, keeping its position (relaunch-in-place). */
export function replaceLeaf(node: PaneNode, fromId: string, toId: string): PaneNode {
  if (node.kind === "leaf") {
    return node.sessionId === fromId ? leaf(toId) : node;
  }
  return {
    ...node,
    a: replaceLeaf(node.a, fromId, toId),
    b: replaceLeaf(node.b, fromId, toId),
  };
}

/**
 * Rebuild the tree with every leaf's session id passed through `map`. Leaves
 * mapped to null are dropped (their split collapses into the sibling).
 */
export function mapLeaves(
  node: PaneNode | null,
  map: (sessionId: string) => string | null,
): PaneNode | null {
  if (!node) return null;
  if (node.kind === "leaf") {
    const next = map(node.sessionId);
    return next ? leaf(next) : null;
  }
  const a = mapLeaves(node.a, map);
  const b = mapLeaves(node.b, map);
  if (!a) return b;
  if (!b) return a;
  return { ...node, a, b };
}

export function setRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === "leaf") return node;
  if (node.id === splitId) return { ...node, ratio: clampRatio(ratio) };
  return {
    ...node,
    a: setRatio(node.a, splitId, ratio),
    b: setRatio(node.b, splitId, ratio),
  };
}

/**
 * Resolve a tree into pixel rectangles for each pane plus the divider strips,
 * leaving a `gutter`-wide gap between siblings.
 */
export function computeLayout(
  node: PaneNode,
  rect: Rect,
  gutter: number,
): { panes: PaneRect[]; dividers: DividerRect[] } {
  const panes: PaneRect[] = [];
  const dividers: DividerRect[] = [];

  const walk = (n: PaneNode, r: Rect): void => {
    if (n.kind === "leaf") {
      panes.push({ sessionId: n.sessionId, rect: r });
      return;
    }
    if (n.dir === "row") {
      const avail = Math.max(0, r.w - gutter);
      const aw = avail * n.ratio;
      dividers.push({
        splitId: n.id,
        dir: n.dir,
        rect: { x: r.x + aw, y: r.y, w: gutter, h: r.h },
        parentRect: r,
      });
      walk(n.a, { x: r.x, y: r.y, w: aw, h: r.h });
      walk(n.b, { x: r.x + aw + gutter, y: r.y, w: avail - aw, h: r.h });
    } else {
      const avail = Math.max(0, r.h - gutter);
      const ah = avail * n.ratio;
      dividers.push({
        splitId: n.id,
        dir: n.dir,
        rect: { x: r.x, y: r.y + ah, w: r.w, h: gutter },
        parentRect: r,
      });
      walk(n.a, { x: r.x, y: r.y, w: r.w, h: ah });
      walk(n.b, { x: r.x, y: r.y + ah + gutter, w: r.w, h: avail - ah });
    }
  };

  walk(node, rect);
  return { panes, dividers };
}

/** Convert a pointer coordinate into the new ratio for a divider's split. */
export function ratioFromPointer(d: DividerRect, clientX: number, clientY: number): number {
  if (d.dir === "row") {
    const avail = d.parentRect.w - d.rect.w;
    return clampRatio(avail > 0 ? (clientX - d.parentRect.x) / avail : 0.5);
  }
  const avail = d.parentRect.h - d.rect.h;
  return clampRatio(avail > 0 ? (clientY - d.parentRect.y) / avail : 0.5);
}
