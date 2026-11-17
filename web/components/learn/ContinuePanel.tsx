"use client";

import Link from "next/link";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { statusOf, useLearnProgress } from "@/lib/client/learn-progress";

export interface CatalogEntry {
  slug: string;
  revision: number;
  title: string;
  code: string;
}

/**
 * How far the learner is, and where to pick up: the first item in course order they haven't
 * completed. The bar, the button and the note's line are all there from the first paint, so
 * nothing moves when progress arrives; until then the count is hidden rather than guessed.
 */
export function ContinuePanel({ entries }: { entries: CatalogEntry[] }) {
  const progress = useLearnProgress();
  const total = entries.length;
  const ready = progress.ready;
  const statuses = entries.map((entry) => statusOf(progress.lessons[entry.slug], entry.revision));
  const done = statuses.filter((status) => status === "complete").length;
  const started = statuses.some((status) => status !== "none");
  const next = ready ? entries.find((_, index) => statuses[index] !== "complete") : entries[0];

  let note = " ";
  if (ready) {
    if (progress.failed) note = "Your saved progress couldn't be loaded. Reload the page to try again.";
    else if (progress.signedIn) note = "Saved to your account.";
    else note = "Sign in to keep progress with your account. Progress from before you sign in isn't copied over.";
  }

  return (
    <section className={styles.continue} aria-label="Your progress" aria-busy={ready ? undefined : true} data-testid="learn-progress">
      <p className={styles.continueCount} data-pending={ready ? undefined : true} data-testid={ready ? "learn-progress-count" : undefined}>
        <span className={styles.continueNumber}>
          {done} of {total}
        </span>{" "}
        completed{ready && !progress.signedIn ? " in this browser" : ""}
      </p>
      <div
        className={`meter ${styles.continueMeter}`}
        role="progressbar"
        aria-label="Lessons completed"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ready ? done : undefined}
        aria-valuetext={ready ? `${done} of ${total} completed` : undefined}
      >
        <span className="progress-fill" style={{ "--progress": total > 0 ? done / total : 0 } as React.CSSProperties} />
      </div>
      <div className={styles.continueActions}>
        {next ? (
          <Link href={`/learn/${next.slug}`} className={`btn btn-primary btn-forward ${styles.continueButton}`} data-testid="continue-learning">
            <span>
              {started ? "Continue learning" : "Start learning"}: {next.code} {next.title}
            </span>
            <Icon name="arrow-right" />
          </Link>
        ) : (
          <>
            <p className={styles.continueDone}>
              <Icon name="check" /> You&apos;ve completed every lesson.
            </p>
            <Link href="/puzzles" className={`btn btn-forward ${styles.continueButton}`}>
              <span>Try a puzzle in a repository you haven&apos;t read</span>
              <Icon name="arrow-right" />
            </Link>
          </>
        )}
        <p className={styles.continueNote} data-failed={progress.failed || undefined}>
          {note}
        </p>
      </div>
    </section>
  );
}
