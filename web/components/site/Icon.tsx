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
  | "theme"
  | "trophy"
  | "flame"
  | "calendar"
  | "clock"
  | "award"
  | "lightbulb"
  | "ranking"
  | "trash"
  | "shield"
  | "compass";

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
  trophy: (
    <>
      <path d="M4.5 2.75h7v3.5a3.5 3.5 0 0 1-7 0z" />
      <path d="M4.5 4H2.75v1a2 2 0 0 0 2 2M11.5 4h1.75v1a2 2 0 0 1-2 2" />
      <path d="M8 9.75v2.5M5.5 13.25h5" />
    </>
  ),
  flame: <path d="M8 13.75c-2.5 0-4.25-1.7-4.25-4 0-2.1 1.5-3.4 2.4-4.9.4 1.3 1.1 2 1.85 2.4C8.3 5.2 8.9 3.6 9.5 2.25c1.6 1.6 2.75 3.9 2.75 6.5 0 3-1.75 5-4.25 5z" />,
  calendar: (
    <>
      <rect x="2.75" y="3.5" width="10.5" height="9.75" rx="1.5" />
      <path d="M2.75 6.75h10.5M5.5 2.25v2.5M10.5 2.25v2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
  award: (
    <>
      <circle cx="8" cy="6.25" r="3.75" />
      <path d="M5.75 9.25l-1 4.5L8 12.25l3.25 1.5-1-4.5" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M5.75 10.25C4.6 9.4 3.75 8.1 3.75 6.5a4.25 4.25 0 0 1 8.5 0c0 1.6-.85 2.9-2 3.75v1h-4.5z" />
      <path d="M6.25 13.5h3.5" />
    </>
  ),
  ranking: <path d="M2.75 13.25V9h3.5v4.25M6.25 13.25V5.5h3.5v7.75M9.75 13.25V7.5h3.5v5.75M2 13.25h12" />,
  trash: (
    <>
      <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5" />
      <path d="M4 4.25l.6 8.6a1.25 1.25 0 0 0 1.25 1.15h4.3a1.25 1.25 0 0 0 1.25-1.15l.6-8.6M6.75 7v4.25M9.25 7v4.25" />
    </>
  ),
  shield: <path d="M8 2.25l5 1.75v3.75c0 3-2.1 5.1-5 6-2.9-.9-5-3-5-6V4z" />,
  compass: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M10.25 5.75L9 9 5.75 10.25 7 7z" />
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
