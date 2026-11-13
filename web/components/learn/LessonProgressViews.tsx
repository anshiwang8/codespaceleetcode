"use client";

import Link from "next/link";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { statusOf, useLearnProgress, type LessonStatus } from "@/lib/client/learn-progress";

const LABELS: Record<LessonStatus, string> = {
  complete: "Completed",
  updated: "Updated since you finished",
  started: "In progress",
  none: "Not started",
};

/** One lesson's status in the catalog. Renders nothing until progress is known, so nothing jumps to "Not started". */
export function LessonStatusBadge({ slug, revision }: { slug: string; revision: number }) {
  const progress = useLearnProgress();
  if (!progress.ready) return <span className={styles.statusSlot} aria-hidden="true" />;
  const status = statusOf(progress.lessons[slug], revision);
  if (status === "none") return <span className={styles.statusSlot} aria-hidden="true" />;
  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`} data-testid={`status-${slug}`} data-status={status}>
      {status === "complete" ? <Icon name="check" /> : null}
      {LABELS[status]}
    </span>
  );
}

interface CatalogEntry {
  slug: string;
  revision: number;
  title: string;
  code: string;
}

/** How far the learner is, and where to pick up: the first item in course order they haven't completed. */
export function CatalogProgress({ entries }: { entries: CatalogEntry[] }) {
  const progress = useLearnProgress();
  const total = entries.length;
  if (!progress.ready) {
    return (
      <div className={styles.catalogProgress} aria-busy="true" data-testid="learn-progress">
        <p className={styles.progressCount}>&nbsp;</p>
        <Link href={`/learn/${entries[0]?.slug ?? ""}`} className="btn btn-primary">
          Start learning
        </Link>
      </div>
    );
  }
  const done = entries.filter((entry) => statusOf(progress.lessons[entry.slug], entry.revision) === "complete").length;
  const next = entries.find((entry) => statusOf(progress.lessons[entry.slug], entry.revision) !== "complete");
  const started = done > 0 || entries.some((entry) => statusOf(progress.lessons[entry.slug], entry.revision) !== "none");
  return (
    <div className={styles.catalogProgress} data-testid="learn-progress">
      <p className={styles.progressCount} data-testid="learn-progress-count">
        {done} of {total} completed
        {progress.signedIn ? "" : " in this browser"}
        {progress.failed ? ". Your saved progress couldn't be loaded; reload to try again." : ""}
      </p>
      {next ? (
        <Link href={`/learn/${next.slug}`} className="btn btn-primary" data-testid="continue-learning">
          {started ? "Continue learning" : "Start learning"}: {next.code} {next.title}
        </Link>
      ) : (
        <p className={styles.progressDone}>
          <Icon name="check" /> You&apos;ve completed every lesson. Try a puzzle in a repository you haven&apos;t read yet.
        </p>
      )}
      {!progress.signedIn ? (
        <p className={styles.progressNote}>
          Signed out, your progress stays in this browser only. Sign in to keep it with your account; progress from
          before you sign in isn&apos;t copied over.
        </p>
      ) : null}
    </div>
  );
}

/** At the top of a lesson: whether it's done, and for a checkpoint, how many items are right. */
export function LessonProgressNote({ slug, revision, requiredCount }: { slug: string; revision: number; requiredCount: number }) {
  const progress = useLearnProgress();
  if (!progress.ready) return <p className={styles.lessonStatus} aria-hidden="true">&nbsp;</p>;
  const entries = progress.lessons[slug];
  const status = statusOf(entries, revision);
  const current = entries?.find((entry) => entry.revision === revision);
  let text: string;
  if (status === "complete") text = progress.signedIn ? "Completed. Saved to your account." : "Completed in this browser.";
  else if (status === "updated") text = "You completed an earlier version. This one has changed: review it and check again.";
  else if (status === "started" && requiredCount > 1) text = `${current?.correct.length ?? 0} of ${requiredCount} checks correct.`;
  else text = requiredCount > 1 ? `Answer all ${requiredCount} checks correctly to complete this.` : "Answer the exit check correctly to complete this lesson.";
  return (
    <p className={styles.lessonStatus} data-testid="lesson-status" data-status={status}>
      {status === "complete" ? <Icon name="check" /> : null}
      {text}
    </p>
  );
}
