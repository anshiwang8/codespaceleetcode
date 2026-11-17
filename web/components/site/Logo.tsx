import styles from "@/components/site/logo.module.css";
import { Mascot } from "@/components/site/Mascot";
import { WORDMARK } from "@/components/site/mascot-geometry";

export type LogoSize = "small" | "medium" | "large";
export type LogoVariant = "lockup" | "mark";

const SIZE_CLASS: Record<LogoSize, string | undefined> = {
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
};

/**
 * The mark alone: the mascot's head (components/site/mascot-geometry.ts), in the mascot's fixed colors.
 * Decorative: whatever holds it gives the accessible name.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={[styles.mark, className].filter(Boolean).join(" ")}>
      <Mascot form="head" />
    </span>
  );
}

/**
 * The logo: the mascot's head, then the word "codebases" drawn as paths in the theme's text color.
 * `variant="mark"` shows the head alone. Either way its accessible name is "codebases".
 * `wordClassName` lets a container hide the word visually at some widths (the header does on a
 * tablet), keeping it for screen readers.
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
        <span className={[styles.word, wordClassName].filter(Boolean).join(" ")}>
          <svg
            className={styles.wordmark}
            viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
            aria-hidden="true"
            focusable="false"
          >
            <path d={WORDMARK.d} fill="currentColor" />
          </svg>
          <span className="visually-hidden">codebases</span>
        </span>
      )}
    </span>
  );
}
