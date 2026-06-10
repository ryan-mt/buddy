interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * The buddy mark: a rounded terminal chip with a prompt chevron and a blinking
 * cursor — a friendly companion that lives in your CLI.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="buddy-grad" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ef8c6c" />
          <stop offset="1" stopColor="#c5503a" />
        </linearGradient>
      </defs>
      {/* chip body */}
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#buddy-grad)" />
      {/* inset screen */}
      <rect x="6" y="6" width="20" height="20" rx="5" fill="#160d0a" fillOpacity="0.3" />
      {/* prompt */}
      <path
        d="M11 12.5 L15.4 16 L11 19.5"
        stroke="#fdeee7"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* blinking cursor */}
      <rect className="logo-cursor" x="16.6" y="17.2" width="5.4" height="2.4" rx="1.2" fill="#fdeee7" />
    </svg>
  );
}
