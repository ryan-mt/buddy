import type { ReactNode } from "react";

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Icon-only pills (label moves to the tooltip) — for tighter 3-4 way switches. */
  compact?: boolean;
}

/** Two-or-more option toggle with a sliding active indicator. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  compact = false,
}: SegmentedControlProps<T>) {
  const activeIndex = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );

  return (
    <div className="relative flex rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1">
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-lg bg-[var(--color-surface-3)] shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out"
        style={{
          width: `calc(${100 / segments.length}% - 0.25rem)`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          onClick={() => onChange(segment.value)}
          title={compact ? segment.label : undefined}
          aria-label={compact ? segment.label : undefined}
          className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-[13px] font-medium transition-colors ${
            segment.value === value
              ? "text-[var(--color-text)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          {segment.icon}
          {!compact && segment.label}
        </button>
      ))}
    </div>
  );
}
