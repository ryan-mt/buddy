// Feeds the `.glass-spot` CSS highlight (index.css) the cursor's position, so
// the sheen on a glass card follows the pointer. Attach to onPointerMove.

import type { PointerEvent } from "react";

export function trackSpotlight(e: PointerEvent<HTMLElement>): void {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
  el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
}
