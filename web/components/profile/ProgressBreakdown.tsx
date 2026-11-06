import Link from "next/link";
import { ProgressFill } from "@/components/motion/ProgressFill";
import styles from "@/components/profile/profile.module.css";
import type { ProgressCount } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";

export interface BreakdownRow extends ProgressCount {
  key: string;
  label: string;
  /** Shown after the label, quieter, such as a repository's language. */
  detail?: string;
  /** A class for the label, such as a difficulty's color. */
  tone?: string;
  /** The puzzle list filtered to this category, built with browseHref. */
  href?: string;
}

interface ProgressBreakdownProps {
  title: string;
  /** For test IDs: `stats-<id>` and `stats-row-<key>`. */
  id: string;
  rows: BreakdownRow[];
  note?: string;
  /** Show the label in the monospace font, as for repository slugs. */
  mono?: boolean;
}

/** One slice of progress, a row per value, each with a bar and the same numbers in words. */
export function ProgressBreakdown({ title, id, rows, note, mono }: ProgressBreakdownProps) {
  const headingId = `breakdown-${id}`;
  return (
    <section className={`card ${styles.breakdown}`} aria-labelledby={headingId} data-testid={`stats-${id}`}>
      <h3 id={headingId} className={styles.cardTitle}>
        {title}
      </h3>
      {note ? <p className={styles.cardNote}>{note}</p> : null}
      <ul className={styles.rows}>
        {rows.map((row) => {
          const share = row.total === 0 ? 0 : (row.solved / row.total) * 100;
          const attemptedShare = row.total === 0 ? 0 : (row.attempted / row.total) * 100;
          const words = `${formatNumber(row.solved)} of ${formatNumber(row.total)} solved`;
          return (
            <li key={row.key} className={styles.row} data-testid={`stats-row-${row.key}`}>
              <span className={styles.rowLabel}>
                {row.href ? (
                  <Link
                    href={row.href}
                    className={[styles.rowLink, row.tone, mono ? "mono" : undefined].filter(Boolean).join(" ")}
                  >
                    {row.label}
                  </Link>
                ) : (
                  <span className={[row.tone, mono ? "mono" : undefined].filter(Boolean).join(" ") || undefined}>
                    {row.label}
                  </span>
                )}
                {row.detail ? <span className={styles.rowDetail}>{row.detail}</span> : null}
              </span>
              <span
                className={`meter ${styles.rowMeter}`}
                role="progressbar"
                aria-label={row.label}
                aria-valuemin={0}
                aria-valuemax={row.total}
                aria-valuenow={row.solved}
                aria-valuetext={words}
              >
                <ProgressFill percent={share} />
                <span className={styles.meterAttempted} style={{ width: "100%", transform: `translateX(${share}%) scaleX(${attemptedShare / 100})` }} />
              </span>
              <span className={styles.rowCount}>
                <span>
                  <span data-testid="solved-count">{formatNumber(row.solved)}</span>
                  <span className="faint"> / {formatNumber(row.total)}</span>
                </span>
                {row.attempted > 0 ? (
                  <span className={styles.rowAttempted}>{formatNumber(row.attempted)} in progress</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
