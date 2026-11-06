import { ProgressFill } from "@/components/motion/ProgressFill";
import styles from "@/components/profile/profile.module.css";
import type { ProfileProgress } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";

/** The four headline numbers. */
export function ProgressOverview({ progress }: { progress: ProfileProgress }) {
  const tiles = [
    { key: "solved", label: "Solved", value: formatNumber(progress.solved), note: "distinct puzzles" },
    { key: "attempted", label: "In progress", value: formatNumber(progress.attempted), note: "attempted, not solved yet" },
    { key: "available", label: "Available", value: formatNumber(progress.total), note: "published puzzles" },
    { key: "completion", label: "Completion", value: `${progress.completionPercent}%`, note: "of available puzzles" },
  ];
  return (
    <section aria-labelledby="overview-heading" className={styles.section}>
      <h2 id="overview-heading" className="section-title">
        Progress overview
      </h2>
      <dl className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.key} className={`card ${styles.tile}`} data-testid={`overview-${tile.key}`}>
            <dt>{tile.label}</dt>
            <dd className={styles.tileValue}>{tile.value}</dd>
            <dd className={styles.tileNote}>{tile.note}</dd>
            {tile.key === "completion" ? (
              <dd>
                <div
                  className="meter"
                  role="progressbar"
                  aria-label="Completion"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.completionPercent}
                  aria-valuetext={`${progress.completionPercent}% complete`}
                >
                  <ProgressFill percent={progress.completionPercent} />
                </div>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
