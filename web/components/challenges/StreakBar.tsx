import type { CSSProperties } from "react";
import styles from "@/components/challenges/challenges.module.css";
import { formatNumber, plural } from "@/lib/format";
import { streakScale } from "@/lib/streak-display";

/**
 * The current streak on a scale that ends at the longest streak or the next milestone. The label
 * under it says what the scale's end is; the bar's value is always given in words too.
 */
export function StreakBar({ current, longest }: { current: number; longest: number }) {
  const { max, nextLabel } = streakScale(current, longest);
  const fill = Math.round(Math.min(1, Math.max(0, current / max)) * 1000) / 10;
  const caption = nextLabel ?? (longest > current ? `Longest: ${plural(longest, "day", "days")}` : null);
  return (
    <div className={styles.streakBar}>
      <div
        className={styles.streakTrack}
        role="progressbar"
        aria-label="Current streak"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={`${formatNumber(current)} of ${plural(max, "day", "days")}`}
        style={{ "--streak-fill": `${fill}%` } as CSSProperties}
      >
        <span className={styles.streakFill} />
      </div>
      <div className={styles.streakScale} data-testid="challenge-streak-scale">
        <span>{caption}</span>
        <span aria-hidden="true">{formatNumber(max)}</span>
      </div>
    </div>
  );
}
