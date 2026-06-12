// Hand-drawn SVG icon set, tuned to buddy's identity (consistent 1.75 stroke,
// rounded joins, the `>` prompt echoing the logo). No external icon library.

interface IconProps {
  size?: number;
  className?: string;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconTerminal({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M5 8l3.5 4L5 16" />
      <path d="M12.5 16H19" />
    </svg>
  );
}

export function IconFolder({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4 7a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.4.6L12 7h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconFolderPlus({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4 7a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.4.6L12 7h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

export function IconPlus({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconClose({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Split the pane to the right: a frame with a vertical divider. */
export function IconSplitRight({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M13 5v14" />
    </svg>
  );
}

/** Split the pane downward: a frame with a horizontal divider. */
export function IconSplitDown({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 13h16" />
    </svg>
  );
}

export function IconPlay({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
      stroke="none"
    >
      <path d="M8 5.4a1 1 0 0 1 1.5-.87l9.1 6.6a1 1 0 0 1 0 1.74l-9.1 6.6A1 1 0 0 1 8 18.6z" />
    </svg>
  );
}

export function IconSparkle({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
      stroke="none"
    >
      <path d="M12 2.6l1.7 6.1a3 3 0 0 0 1.6 1.6l6.1 1.7-6.1 1.7a3 3 0 0 0-1.6 1.6L12 21.4l-1.7-6.1a3 3 0 0 0-1.6-1.6L2.6 12l6.1-1.7a3 3 0 0 0 1.6-1.6z" />
    </svg>
  );
}

export function IconChevron({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconFile({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13 4v5h5" />
    </svg>
  );
}

/** `</>` — opens a project in the code editor. */
export function IconCode({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  );
}

/** Download / install — arrow into a tray. */
export function IconDownload({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M12 4v9.5M8.5 10.5 12 14l3.5-3.5" />
      <path d="M5 16v2a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-2" />
    </svg>
  );
}

export function IconTrash({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M5 7h14M10 7V5h4v2M9 7l.7 11a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L15 7" />
    </svg>
  );
}

export function IconSpinner({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export function IconSun({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function IconMoon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/** Profiles / accounts: an ID card with an avatar and name lines. */
export function IconProfiles({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.4 16c.2-1.6 1.5-2.4 3.1-2.4s2.9.8 3.1 2.4" />
      <path d="M14.5 10h3.5M14.5 13h3.5" />
    </svg>
  );
}

/** History: a clock face with a counter-clockwise rewind arrow. */
export function IconHistory({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4.2 13a8 8 0 1 0 2.3-6.3" />
      <path d="M3 4v3.2h3.2" />
      <path d="M12 8.5V12l2.6 1.6" />
    </svg>
  );
}

/** Resume / reopen: a circular back-arrow wrapping a play triangle. */
export function IconResume({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4.5 9a8 8 0 1 1-1 5" />
      <path d="M3 4.5V9h4.5" />
      <path d="M11 10.2v3.6l3-1.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Transcript: a page of text lines. */
export function IconTranscript({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </svg>
  );
}

/** Edit: a pencil. */
export function IconPencil({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4 20l1-4L15.5 5.5a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8 19z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

/** Settings: two sliders. */
export function IconSettings({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4 8h7M15 8h5" />
      <circle cx="13" cy="8" r="2" />
      <path d="M4 16h4M12 16h8" />
      <circle cx="10" cy="16" r="2" />
    </svg>
  );
}

/** Search: a magnifier. */
export function IconSearch({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.8 14.8L20 20" />
    </svg>
  );
}

/** Send: a paper plane tilted up-right. */
export function IconSend({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M20 4 9.7 14.3M20 4l-6.3 16-3-6.5L4 10.3z" />
    </svg>
  );
}

/** Formation: a split frame crowned with a small spark — a saved squad. */
export function IconFormation({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M12 7v13M4 14h8" />
      <path d="M12 2.2l.8 1.6 1.6.8-1.6.8-.8 1.6-.8-1.6-1.6-.8 1.6-.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Bookmark: save this snippet for later. */
export function IconBookmark({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M7 4.5h10V20l-5-3.6L7 20z" />
    </svg>
  );
}

/** Broadcast: a dot radiating arcs both ways — one keystroke, every pane. */
export function IconBroadcast({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.7 18.3a9 9 0 0 1 0-12.6M18.3 5.7a9 9 0 0 1 0 12.6" />
    </svg>
  );
}

/** Restart: a circular arrow chasing its own tail. */
export function IconRestart({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.5v3.7h-3.7" />
    </svg>
  );
}

/** Zoom a pane to fill the grid: corner arrows pointing outward. */
export function IconExpand({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M14 4h6v6M20 4l-6.5 6.5" />
      <path d="M10 20H4v-6M4 20l6.5-6.5" />
    </svg>
  );
}

/** Restore a zoomed pane: corner arrows pointing inward. */
export function IconCollapse({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M20 10h-6V4M14 10l6.5-6.5" />
      <path d="M4 14h6v6M10 14l-6.5 6.5" />
    </svg>
  );
}

/** Chat: a speech bubble carrying the `>` prompt — talk to a model directly. */
export function IconChat({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M4 7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v7a2.5 2.5 0 0 1-2.5 2.5H9.5L5.5 20l.1-3.5H6.5A2.5 2.5 0 0 1 4 14z" />
      <path d="M8.5 8.5l2.5 2.2-2.5 2.2M13 13h3" />
    </svg>
  );
}

/** Stop generation: a filled rounded square. */
export function IconStop({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
      stroke="none"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

/** Copy: two offset sheets. */
export function IconCopy({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 14.5A1.5 1.5 0 0 1 3.5 13V5.5A1.5 1.5 0 0 1 5 4h7.5A1.5 1.5 0 0 1 14 5.5" />
    </svg>
  );
}

/** Send (chat): straight-up arrow, lives in the round accent button. */
export function IconArrowUp({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}

/** Overflow menu: three quiet dots (filled — strokes read as rings this small). */
export function IconDots({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
      stroke="none"
    >
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

/** Tool-access shield (the chat composer's permission picker). */
export function IconShield({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <path d="M12 3.8l6.3 2.2v5c0 4.3-2.7 7-6.3 9.2-3.6-2.2-6.3-4.9-6.3-9.2v-5z" />
    </svg>
  );
}

/** Working-tree diff: a split sheet, old (−) on the left, new (+) on the right. */
export function IconDiff({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M12 4.5v15" />
      <path d="M6.2 12h3.1" />
      <path d="M14.7 12h3.1M16.25 10.45v3.1" />
    </svg>
  );
}

/** Git branch: trunk with a merged-in fork. */
export function IconBranch({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <circle cx="7" cy="6" r="2.1" />
      <circle cx="7" cy="18" r="2.1" />
      <circle cx="17" cy="7.5" r="2.1" />
      <path d="M7 8.1v7.8" />
      <path d="M17 9.6c-.2 3.4-3.4 4.6-7.6 4.9" />
    </svg>
  );
}

// ── Brand marks ───────────────────────────────────────────────────────────────
// Each CLI's REAL logo, traced from the vendor's official single-color SVG
// (sources: simple-icons for Claude/Gemini/opencode, OpenAI's published mark,
// svgl for Grok). They fill with `currentColor`, so buddy's own (non-vendor)
// accent palette tints them. Each keeps its source viewBox so the path scales
// cleanly into `size`×`size`.

/** Anthropic / Claude — the radial sunburst mark. */
export function LogoClaude({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

/** OpenAI / Codex — the interlocking "blossom" knot. */
export function LogoCodex({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 260" className={className} aria-hidden fill="currentColor">
      <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
    </svg>
  );
}

/** Google Gemini — four-pointed spark with concave sides. */
export function LogoGemini({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
    </svg>
  );
}

/** xAI / Grok — the angular twin-slash mark. */
export function LogoGrok({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} aria-hidden fill="currentColor">
      <path d="M395.479 633.828L735.91 381.105C752.599 368.715 776.454 373.548 784.406 392.792C826.26 494.285 807.561 616.253 724.288 699.996C641.016 783.739 525.151 802.104 419.247 760.277L303.556 814.143C469.49 928.202 670.987 899.995 796.901 773.282C896.776 672.843 927.708 535.937 898.785 412.476L899.047 412.739C857.105 231.37 909.358 158.874 1016.4 10.6326C1018.93 7.11771 1021.47 3.60279 1024 0L883.144 141.651V141.212L395.392 633.916" />
      <path d="M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668C403.431 226.097 526.549 195.254 634.026 240.596L749.454 186.994C728.657 171.88 702.007 155.623 671.424 144.2C533.19 86.9942 367.693 115.465 255.323 228.382C147.234 337.081 113.244 504.215 171.613 646.833C215.216 753.423 143.739 828.818 71.7385 904.916C46.2237 931.893 20.6216 958.87 0 987.429L325.139 695.339" />
    </svg>
  );
}

/** opencode — the bordered terminal frame. */
export function LogoOpencode({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor" fillRule="evenodd" clipRule="evenodd">
      <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" />
    </svg>
  );
}
