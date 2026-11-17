"use client";

import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { statusOf, useLearnProgress, type LessonStatus } from "@/lib/client/learn-progress";

const LABELS: Record<Exclude<LessonStatus, "none">, string> = {
  complete: "Completed",
  updated: "Updated",
  started: "In progress",
};

/**
 * One lesson's place on the rail and its status: an open ring, half filled once started, a check
 * when complete, a dot when the lesson changed after it was completed. The ring and the label's
 * slot are the same size in every state, so nothing moves when progress arrives; until it does the
 * ring stays open and no status is claimed. Both parts are cells of the row's grid.
 */
export function LessonNode({ slug, revision, milestone = false }: { slug: string; revision: number; milestone?: boolean }) {
  const progress = useLearnProgress();
  const status = progress.ready ? statusOf(progress.lessons[slug], revision) : "none";
  return (
    <>
      <span className={styles.nodeCell}>
        <span
          className={styles.node}
          data-status={status}
          data-milestone={milestone || undefined}
          data-testid={status === "none" ? undefined : `status-${slug}`}
        >
          {status === "complete" ? <Icon name="check" /> : milestone && status === "none" ? <Icon name="award" /> : null}
          {status === "none" ? null : <span className="visually-hidden">{LABELS[status]}. </span>}
        </span>
      </span>
      <span className={styles.rowStatus} data-status={status} aria-hidden="true">
        {status === "none" ? null : LABELS[status]}
      </span>
    </>
  );
}
