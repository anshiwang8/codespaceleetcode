import styles from "@/components/site/logo.module.css";
import { MARK_NODE_RADIUS, MARK_NODES, MARK_PATH, MARK_RADIUS, MARK_SIZE, MARK_STROKE } from "@/components/site/mark";

export type LogoSize = "small" | "medium" | "large";
export type LogoVariant = "lockup" | "mark";

const SIZE_CLASS: Record<LogoSize, string | undefined> = {
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
};

/**
 * The mark alone (components/site/mark.ts), in the theme's accent and accent ink. Decorative:
 * whatever holds it gives the accessible name.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={[styles.mark, className].filter(Boolean).join(" ")}
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect className={styles.tile} width={MARK_SIZE} height={MARK_SIZE} rx={MARK_RADIUS} />
      <path className={styles.glyph} d={MARK_PATH} strokeWidth={MARK_STROKE} />
      {MARK_NODES.map(({ cx, cy }) => (
        <circle key={`${cx},${cy}`} className={styles.node} cx={cx} cy={cy} r={MARK_NODE_RADIUS} />
      ))}
    </svg>
  );
}

/**
 * The logo: the mark, then the word "codebases" in the UI font. `variant="mark"` shows the mark
 * alone. Either way its accessible name is "codebases". Its colors are theme tokens, so it follows
 * every theme. `wordClassName` lets a container hide the word visually at some widths (the header
 * does on a tablet), keeping it for screen readers.
 */
export function Logo({
  size = "small",
  variant = "lockup",
  className,
  wordClassName,
}: {
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
  wordClassName?: string;
}) {
  return (
    <span className={[styles.logo, SIZE_CLASS[size], className].filter(Boolean).join(" ")} data-testid="logo">
      <LogoMark />
      {variant === "mark" ? (
        <span className="visually-hidden">codebases</span>
      ) : (
        <span className={[styles.word, wordClassName].filter(Boolean).join(" ")}>codebases</span>
      )}
    </span>
  );
}
