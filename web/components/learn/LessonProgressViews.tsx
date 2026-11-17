"use client";

import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { statusOf, useLearnProgress } from "@/lib/client/learn-progress";

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
