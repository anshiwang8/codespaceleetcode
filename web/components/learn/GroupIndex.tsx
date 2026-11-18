"use client";

import { useEffect, useState } from "react";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { statusOf, useLearnProgress } from "@/lib/client/learn-progress";

interface GroupLessons {
  lessons: { slug: string; revision: number }[];
}

export interface IndexGroup extends GroupLessons {
  id: string;
  number: number;
  title: string;
}

function useGroupCount({ lessons }: GroupLessons): { ready: boolean; done: number; total: number } {
  const progress = useLearnProgress();
  const done = lessons.filter((lesson) => statusOf(progress.lessons[lesson.slug], lesson.revision) === "complete").length;
  return { ready: progress.ready, done, total: lessons.length };
}

/** "3 of 8 completed" under a group's title. Its line is reserved, and hidden until progress is known. */
export function GroupProgress({ lessons }: GroupLessons) {
  const { ready, done, total } = useGroupCount({ lessons });
  return (
    <p className={styles.groupProgress} data-pending={ready ? undefined : true} data-done={(ready && done === total) || undefined}>
      {ready && done === total ? <Icon name="check" /> : null}
      {done} of {total} completed
    </p>
  );
}

function IndexCount({ lessons }: GroupLessons) {
  const { ready, done, total } = useGroupCount({ lessons });
  return (
    <span className={styles.indexCount} data-pending={ready ? undefined : true} data-done={(ready && done === total) || undefined}>
      {done} of {total}
    </span>
  );
}

/**
 * The four groups, kept in view beside the path on wide screens, with each one's progress and
 * the one being read marked. The stylesheet hides it below 1100px, where the groups' own headers
 * carry the same counts.
 */
export function GroupIndex({ groups }: { groups: IndexGroup[] }) {
  const [current, setCurrent] = useState(groups[0]?.id ?? "");

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-learn-group]")];
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const inBand = new Set<string>();
    // A group is "in view" while it crosses a band a third of the way down the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.learnGroup ?? "";
          if (entry.isIntersecting) inBand.add(id);
          else inBand.delete(id);
        }
        const first = sections.find((section) => inBand.has(section.dataset.learnGroup ?? ""));
        if (first?.dataset.learnGroup) setCurrent(first.dataset.learnGroup);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className={styles.index} aria-label="Groups" data-testid="group-index">
      <ol>
        {groups.map((group) => (
          <li key={group.id}>
            <a
              href={`#group-${group.id}`}
              className={styles.indexLink}
              aria-current={current === group.id ? "location" : undefined}
              data-testid={`index-${group.id}`}
            >
              <span className={styles.indexNumber}>{group.number}</span>
              <span className={styles.indexTitle}>{group.title}</span>
              <IndexCount lessons={group.lessons} />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
