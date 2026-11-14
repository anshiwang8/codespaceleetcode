import type { Metadata } from "next";
import Link from "next/link";
import { CatalogProgress, LessonStatusBadge } from "@/components/learn/LessonProgressViews";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { COURSE } from "@/lib/learn/course.generated";
import { allLessons, getLesson, lessonHref, prerequisiteText } from "@/lib/learn/course";
import type { LearnGroup, LearnModule, PublicLesson } from "@/lib/learn/types";

export const metadata: Metadata = {
  title: "Learn",
  description: "A self-paced course in reading real software, from your first line of code to tracing a real repository.",
};

const KIND_LABEL: Record<PublicLesson["kind"], string> = { lesson: "Lesson", checkpoint: "Checkpoint", capstone: "Capstone" };

function LessonRow({ lesson }: { lesson: PublicLesson }) {
  const prerequisite = prerequisiteText(lesson);
  return (
    <li className={styles.catalogItem} data-testid={`catalog-${lesson.slug}`}>
      <div className={styles.catalogMain}>
        <span className={styles.catalogCode}>{lesson.code}</span>
        <div>
          <h4 className={styles.catalogTitle}>
            <Link href={lessonHref(lesson.slug)}>{lesson.title}</Link>
            {lesson.kind !== "lesson" ? <span className="badge badge-info">{KIND_LABEL[lesson.kind]}</span> : null}
          </h4>
          <p className={styles.catalogSummary}>{lesson.summary}</p>
          <p className={styles.catalogMeta}>
            <span>
              <Icon name="clock" /> {lesson.minutes} min
            </span>
            {lesson.badge ? <span>{lesson.badge}</span> : null}
            {prerequisite ? <span>{prerequisite}</span> : null}
          </p>
        </div>
      </div>
      <LessonStatusBadge slug={lesson.slug} revision={lesson.revision} />
    </li>
  );
}

/**
 * The Learn catalog. Static and the same for everyone: progress comes to the browser from
 * /api/me/learn when signed in, or this browser's storage when not, and fills in client-side.
 */
export default function LearnPage() {
  const lessons = allLessons();
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
  const entries = lessons.map((lesson) => ({ slug: lesson.slug, revision: lesson.revision, title: lesson.title, code: lesson.code }));
  return (
    <main className={`page ${styles.page}`} data-testid="learn">
      <div className="page-header">
        <div>
          <h1 className="page-title">Learn</h1>
          <p className="page-lede">{COURSE.summary}</p>
        </div>
      </div>

      <section className={`card ${styles.intro}`} aria-labelledby="learn-how">
        <h2 id="learn-how" className="section-title">
          How it works
        </h2>
        <ul className={styles.introList}>
          <li>
            {COURSE.groups.length} groups, {COURSE.groups.reduce((sum, group) => sum + group.modules.length, 0)} modules
            and {lessons.length} lessons, checkpoints and a capstone: about {Math.round(minutes / 60)} hours in all. You need
            only a browser.
          </li>
          <li>Each lesson has a worked example, a practice question and an exit check. You choose answers; nothing runs code.</li>
          <li>A correct exit check completes a lesson. Showing an answer doesn&apos;t, but you can still check afterwards.</li>
          <li>Real puzzles stay in the puzzle workspace. Lessons suggest some to try next and never give their answers.</li>
        </ul>
        <p className={styles.introPlacement}>
          <strong>Where to start.</strong> Start at L01 if variables or branches are new to you. If you can complete C1
          without help, start at L07. If C2 is comfortable, start at L13. Suggested prerequisites guide you; nothing is
          locked.
        </p>
        <CatalogProgress entries={entries} />
      </section>

      {COURSE.groups.map((group) => {
        const { modules, trailing } = layoutGroup(group);
        return (
          <section key={group.id} className={`card ${styles.group}`} aria-labelledby={`group-${group.id}`}>
            <h2 id={`group-${group.id}`} className="section-title">
              Group {group.number}: {group.title}
            </h2>
            <p className={styles.groupSummary}>{group.summary}</p>
            {modules.map(({ learnModule, items }) => (
              <div key={learnModule.id} className={styles.module}>
                <h3 className={styles.moduleTitle}>
                  Module {learnModule.number}: {learnModule.title}
                </h3>
                <p className={styles.moduleSummary}>{learnModule.summary}</p>
                <ol className={styles.catalogList}>
                  {items.map((lesson) => (
                    <LessonRow key={lesson.slug} lesson={lesson} />
                  ))}
                </ol>
              </div>
            ))}
            {trailing ? (
              <ol className={`${styles.catalogList} ${styles.checkpointList}`}>
                <LessonRow lesson={trailing} />
              </ol>
            ) : null}
          </section>
        );
      })}
    </main>
  );
}

/**
 * A group's modules with their lessons, in course order. A checkpoint that the course places
 * before one of the group's lessons (C4, before the capstone) is listed in that lesson's module,
 * just before it; any other checkpoint is listed after the group's modules.
 */
function layoutGroup(group: LearnGroup): { modules: { learnModule: LearnModule; items: PublicLesson[] }[]; trailing: PublicLesson | null } {
  const checkpoint = group.checkpoint ? getLesson(group.checkpoint) : null;
  let placed = false;
  const modules = group.modules.map((learnModule) => {
    const items: PublicLesson[] = [];
    for (const lesson of learnModule.lessons.map(getLesson)) {
      if (!lesson) continue;
      if (checkpoint && !placed && checkpoint.position < lesson.position) {
        items.push(checkpoint);
        placed = true;
      }
      items.push(lesson);
    }
    return { learnModule, items };
  });
  return { modules, trailing: placed ? null : checkpoint };
}
