/**
 * The site's one icon set. Every icon is drawn on the same 16-unit grid with the same 1.5 stroke,
 * round caps and joins, and sized in em, so it matches the text beside it. Icons are decoration:
 * the text or an aria-label always says the same thing, so each one is hidden from assistive
 * technology. Use these instead of text glyphs such as ✓ or ▲, which every font draws differently.
 */

export type IconName =
  | "check"
  | "x"
  | "alert"
  | "lock"
  | "plus"
  | "chevron-right"
  | "chevron-down"
  | "arrow-up"
  | "arrow-down"
  | "sort-up"
  | "sort-down"
  | "star"
  | "star-filled"
  | "status-unsolved"
  | "status-attempted"
  | "status-solved"
  | "theme";

const PATHS: Record<IconName, React.ReactNode> = {
  check: <path d="M3.5 8.5l3 3 6-7" />,
  x: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  alert: (
    <>
      <path d="M8 2.5l6 11H2z" />
      <path d="M8 6.75v3" />
      <circle cx="8" cy="11.75" r="0.4" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  "chevron-right": <path d="M6 3.5l4.5 4.5L6 12.5" />,
  "chevron-down": <path d="M3.5 6l4.5 4.5L12.5 6" />,
  "arrow-up": <path d="M8 13V3.5M4 7.5l4-4 4 4" />,
  "arrow-down": <path d="M8 3v9.5M4 8.5l4 4 4-4" />,
  "sort-up": <path d="M4 10l4-4 4 4" />,
  "sort-down": <path d="M4 6l4 4 4-4" />,
  star: <path d="M8 2.25l1.8 3.7 4 .55-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.55z" />,
  "star-filled": (
    <path d="M8 2.25l1.8 3.7 4 .55-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.55z" fill="currentColor" />
  ),
  "status-unsolved": <circle cx="8" cy="8" r="5.25" />,
  "status-attempted": (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M8 2.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" />
    </>
  ),
  "status-solved": (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <path d="M5.5 8.25l1.75 1.75L10.5 6.5" />
    </>
  ),
  theme: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 2.25a5.75 5.75 0 0 1 0 11.5z" fill="currentColor" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  className?: string;
  /** The em size. 1 matches the surrounding text's font size. */
  size?: number;
}

export function Icon({ name, className, size = 1 }: IconProps) {
  return (
    <svg
      className={["icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 16 16"
      width={`${size}em`}
      height={`${size}em`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {PATHS[name]}
    </svg>
  );
}
