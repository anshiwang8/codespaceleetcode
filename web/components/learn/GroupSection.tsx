import { ViewTransition } from "react";
import { InlineText } from "@/components/learn/InlineText";
import { GroupProgress } from "@/components/learn/GroupIndex";
import { LessonNode } from "@/components/learn/LessonNode";
import { PlateImage } from "@/components/learn/PlateImage";
import styles from "@/components/learn/learn.module.css";
import { IntentLink } from "@/components/site/IntentLink";
import type { LearnGroup, LearnModule, PublicLesson } from "@/lib/learn/types";

const KIND_LABEL: Record<PublicLesson["kind"], string> = { lesson: "Lesson", checkpoint: "Checkpoint", capstone: "Capstone" };

/** How many rows arrive in order when the page opens; the rest are already in place. */
const STAGGERED_ROWS = 6;

export interface GroupLayout {
  group: LearnGroup;
  modules: { learnModule: LearnModule; items: PublicLesson[] }[];
  /** A checkpoint listed after the group's modules. */
  trailing: PublicLesson | null;
  /** The first row's place in the whole course, for the opening stagger. */
  firstRow: number;
}

/**
 * One lesson on the rail. The whole row is the link. Its code and title carry the lesson's
 * shared-element name, so they travel into the lesson page's header.
 */
function LessonRow({ lesson, row }: { lesson: PublicLesson; row: number }) {
  const milestone = lesson.kind !== "lesson";
  return (
    <li
      className={`${styles.railItem} ${row < STAGGERED_ROWS ? "stagger-in" : ""}`}
      style={row < STAGGERED_ROWS ? ({ "--i": row } as React.CSSProperties) : undefined}
      data-testid={`catalog-${lesson.slug}`}
      data-kind={lesson.kind}
    >
      <IntentLink href={`/learn/${lesson.slug}`} className={styles.row}>
        <LessonNode slug={lesson.slug} revision={lesson.revision} milestone={milestone} />
        <span className={styles.rowBody}>
          <span className={styles.rowHeadline}>
            <ViewTransition name={"lesson-" + lesson.slug} share="morph" default="none">
              <span className={styles.rowHead}>
                <span className={styles.rowCode}>{lesson.code}</span> <span className={styles.rowTitle}>{lesson.title}</span>
              </span>
            </ViewTransition>
            {milestone ? <span className="badge badge-info">{KIND_LABEL[lesson.kind]}</span> : null}
            {lesson.badge ? <span className="badge">{lesson.badge}</span> : null}
          </span>
          <span className={styles.rowSummary}>
            <InlineText text={lesson.summary} />
          </span>
        </span>
        <span className={styles.rowMinutes}>{lesson.minutes}&nbsp;min</span>
      </IntentLink>
    </li>
  );
}

/**
 * A group of the course: its illustration, number, title, summary and progress, then its modules
 * as rails of lessons. A section, not a card. The plate keeps its 3:2 box whether or not the
 * picture has loaded.
 */
export function GroupSection({ group, modules, trailing, firstRow }: GroupLayout) {
  const lessons = [...modules.flatMap((item) => item.items), ...(trailing ? [trailing] : [])];
  const moduleStart = (index: number) => firstRow + modules.slice(0, index).reduce((count, item) => count + item.items.length, 0);
  return (
    <section className={styles.group} aria-labelledby={`group-${group.id}`} data-learn-group={group.id}>
      <header className={styles.groupHead}>
        <div className={`plate ${styles.groupPlate}`}>
          <PlateImage base={`/learn/group-${group.number}`} eager={group.number === 1} />
        </div>
        <div className={styles.groupText}>
          <h2 id={`group-${group.id}`} className={styles.groupTitle}>
            {/* Read out as "Group 1: Read a small program"; shown as the number and the title. */}
            <span className="visually-hidden">Group {group.number}: </span>
            <span className={styles.groupNumber} aria-hidden="true">
              {group.number}
            </span>
            {group.title}
          </h2>
          <p className={styles.groupSummary}>{group.summary}</p>
          <GroupProgress lessons={lessons.map((lesson) => ({ slug: lesson.slug, revision: lesson.revision }))} />
        </div>
      </header>

      {modules.map(({ learnModule, items }, moduleIndex) => (
        <div key={learnModule.id} className={styles.module}>
          <div className={styles.moduleHead}>
            <h3 className={styles.moduleTitle}>
              Module {learnModule.number}: {learnModule.title}
            </h3>
            <p className={styles.moduleSummary}>{learnModule.summary}</p>
          </div>
          <ol className={styles.rail}>
            {items.map((lesson, index) => (
              <LessonRow key={lesson.slug} lesson={lesson} row={moduleStart(moduleIndex) + index} />
            ))}
          </ol>
        </div>
      ))}
      {trailing ? (
        <ol className={`${styles.rail} ${styles.railTrailing}`}>
          <LessonRow lesson={trailing} row={firstRow + lessons.length - 1} />
        </ol>
      ) : null}
    </section>
  );
}
