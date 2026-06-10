import { useRef } from "react";
import { ratioFromPointer, type DividerRect } from "../../lib/layout";

interface SplitDividersProps {
  dividers: DividerRect[];
  onResize: (splitId: string, ratio: number) => void;
}

/**
 * Draggable handles sitting in the gutters between panes. Rendered as an overlay
 * that fills the same box the layout was computed against, so a divider's
 * `parentRect` (in that box's coordinates) lines up with pointer positions.
 */
export function SplitDividers({ dividers, onResize }: SplitDividersProps) {
  const drag = useRef<{ splitId: string; left: number; top: number } | null>(null);

  return (
    <>
      {dividers.map((d) => (
        <div
          key={d.splitId}
          onPointerDown={(e) => {
            e.preventDefault();
            const box = e.currentTarget.parentElement?.getBoundingClientRect();
            if (!box) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { splitId: d.splitId, left: box.left, top: box.top };
          }}
          onPointerMove={(e) => {
            const g = drag.current;
            if (!g || g.splitId !== d.splitId) return;
            onResize(d.splitId, ratioFromPointer(d, e.clientX - g.left, e.clientY - g.top));
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          className="group absolute z-20 flex items-center justify-center"
          style={{
            left: d.rect.x,
            top: d.rect.y,
            width: d.rect.w,
            height: d.rect.h,
            cursor: d.dir === "row" ? "col-resize" : "row-resize",
          }}
        >
          <span
            className="bg-[var(--color-border)] transition-colors group-hover:bg-[var(--color-accent-dim)]"
            style={
              d.dir === "row"
                ? { width: 1, height: "100%" }
                : { width: "100%", height: 1 }
            }
          />
        </div>
      ))}
    </>
  );
}
