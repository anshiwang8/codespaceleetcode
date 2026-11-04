import styles from "@/components/site/logo.module.css";

export type LogoSize = "small" | "medium" | "large";

const SIZE_CLASS: Record<LogoSize, string | undefined> = {
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
};

/**
 * The wordmark: "code" in plain text, "bases" in a blue box. It's text, not an image, and reads as
 * one word, "codebases", to assistive technology.
 */
export function Logo({ size = "small", className }: { size?: LogoSize; className?: string }) {
  return (
    <span className={[styles.logo, SIZE_CLASS[size], className].filter(Boolean).join(" ")} data-testid="logo">
      {/* The two halves are styled apart, so the whole word is given once for screen readers. */}
      <span aria-hidden="true" className={styles.word}>
        <span className={styles.code}>code</span>
        <span className={styles.bases}>bases</span>
      </span>
      <span className="visually-hidden">codebases</span>
    </span>
  );
}
