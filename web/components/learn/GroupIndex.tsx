"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { followAnchor } from "@/components/site/SmoothAnchor";
import { SwapIcon } from "@/components/site/SwapIcon";
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

/** One group in the index: its number, title, count and a bar that fills as lessons complete. */
function IndexItem({ group, current, onFollow }: { group: IndexGroup; current: boolean; onFollow: (event: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const { ready, done, total } = useGroupCount(group);
  const complete = ready && done === total;
  return (
    <a
      href={`#group-${group.id}`}
      className={styles.indexLink}
      aria-current={current ? "location" : undefined}
      data-testid={`index-${group.id}`}
      onClick={onFollow}
    >
      <span className={styles.indexNumber}>{complete ? <SwapIcon name="check" /> : group.number}</span>
      <span className={styles.indexTitle}>{group.title}</span>
      <span className={styles.indexCount} data-pending={ready ? undefined : true} data-done={complete || undefined}>
        {done} of {total}
      </span>
      <span className={styles.indexBar} aria-hidden="true">
        <span className={styles.indexBarFill} data-done={complete || undefined} style={{ transform: `scaleX(${ready && total > 0 ? done / total : 0})` }} />
      </span>
    </a>
  );
}

function IndexTotal({ groups }: { groups: IndexGroup[] }) {
  const { ready, done, total } = useGroupCount({ lessons: groups.flatMap((group) => group.lessons) });
  return (
    <span className={styles.indexTotal} data-pending={ready ? undefined : true}>
      {done} of {total}
    </span>
  );
}

/**
 * The four groups, kept in view while the path scrolls: a card beside it on wide screens, a row
 * of chips above it on narrow ones. Each group shows its progress, and one marker slides to the
 * group being read. Following a link scrolls there; until that scroll ends the marker stays on
 * the group that was chosen, rather than ticking through the ones passed on the way.
 */
export function GroupIndex({ groups }: { groups: IndexGroup[] }) {
  const [current, setCurrent] = useState(groups[0]?.id ?? "");
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const locked = useRef(false);

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
        if (locked.current) return;
        const first = sections.find((section) => inBand.has(section.dataset.learnGroup ?? ""));
        if (first?.dataset.learnGroup) setCurrent(first.dataset.learnGroup);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // The marker takes the current link's place, and a chip row keeps the current chip in view.
  useLayoutEffect(() => {
    const box = list.current;
    const link = box?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!box || !link) return;
    const place = () => setMarker({ top: link.offsetTop, height: link.offsetHeight });
    place();
    if (box.scrollWidth > box.clientWidth) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo({ left: link.offsetLeft - (box.clientWidth - link.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
    }
    if (typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(place);
    resize.observe(box);
    return () => resize.disconnect();
  }, [current]);

  const follow = (event: React.MouseEvent<HTMLAnchorElement>) =>
    followAnchor(event, {
      onStart: (id) => {
        locked.current = true;
        setCurrent(id.replace(/^group-/, ""));
      },
      onEnd: () => {
        locked.current = false;
      },
    });

  return (
    <nav className={styles.index} aria-label="Groups" data-testid="group-index">
      <p className={styles.indexHead}>
        <span className={styles.indexHeadTitle}>Your path</span>
        <IndexTotal groups={groups} />
      </p>
      <div className={styles.indexTrack}>
        <span
          className={styles.indexMarker}
          aria-hidden="true"
          data-placed={marker ? true : undefined}
          style={marker ? { transform: `translateY(${marker.top}px) scaleY(${marker.height})` } : undefined}
        />
        <ol ref={list} className={styles.indexList}>
          {groups.map((group) => (
            <li key={group.id}>
              <IndexItem group={group} current={current === group.id} onFollow={follow} />
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
