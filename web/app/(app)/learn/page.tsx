import type { Metadata } from "next";
import Link from "next/link";
import { ContinuePanel } from "@/components/learn/ContinuePanel";
import { GroupIndex } from "@/components/learn/GroupIndex";
import { GroupSection, type GroupLayout } from "@/components/learn/GroupSection";
import { StaggerOnce } from "@/components/learn/StaggerOnce";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import { Mascot } from "@/components/site/Mascot";
import { COURSE } from "@/lib/learn/course.generated";
import { allLessons, getLesson, lessonHref } from "@/lib/learn/course";
import type { LearnGroup, PublicLesson } from "@/lib/learn/types";

export const metadata: Metadata = {
  title: "Learn",
  description: "A self-paced course in reading real software, from your first line of code to tracing a real repository.",
};

/** The three places to start, by what the reader can already do. */
const STARTS = [
  { code: "L01", who: "New to code", fit: "Variables or branches are new to you." },
  { code: "L07", who: "Can trace small programs", fit: "You can complete checkpoint C1 without help." },
  { code: "L13", who: "Comfortable in a repository", fit: "Checkpoint C2 is comfortable." },
];

/**
 * The Learn catalog. Static and the same for everyone: progress comes to the browser from
 * /api/me/learn when signed in, or this browser's storage when not, and fills in client-side
 * into space that's already reserved.
 */
export default function LearnPage() {
  const lessons = allLessons();
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
  const count = (kind: PublicLesson["kind"]) => lessons.filter((lesson) => lesson.kind === kind).length;
  const entries = lessons.map((lesson) => ({ slug: lesson.slug, revision: lesson.revision, title: lesson.title, code: lesson.code }));
  const starts = STARTS.flatMap((start) => {
    const lesson = lessons.find((item) => item.code === start.code);
    return lesson ? [{ ...start, lesson }] : [];
  });
  const layouts = COURSE.groups.reduce<GroupLayout[]>((done, group) => {
    const last = done.at(-1);
    const firstRow = last ? last.firstRow + rowCount(last) : 0;
    return [...done, { ...layoutGroup(group), firstRow }];
  }, []);
  // The lede is the course summary's first sentence; the rest is said under "How it works".
  const lede = COURSE.summary.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? COURSE.summary;

  return (
    <main className={`page ${styles.page} ${styles.catalog}`} data-testid="learn">
      <header className={styles.catalogHeader}>
        <div>
          <h1 className="page-title">Learn</h1>
          <p className={`page-lede ${styles.lede}`}>{lede}</p>
        </div>
        <div className={styles.mascotBox} aria-hidden="true">
          <Mascot form="full" />
        </div>
      </header>

      <ContinuePanel entries={entries} />

      <div className={styles.intro}>
        <section className={styles.introRow} aria-labelledby="learn-start">
          <div>
            <h2 id="learn-start" className={styles.introTitle}>
              Where to start
            </h2>
            <p className={styles.introNote}>Nothing is locked. Pick the closest fit.</p>
          </div>
          <ul className={styles.startChoices}>
            {starts.map(({ code, who, fit, lesson }) => (
              <li key={code}>
                <Link href={lessonHref(lesson.slug)} className={styles.startChoice} data-testid={`start-${code}`}>
                  <span className={styles.startWho}>{who}</span>
                  <span className={styles.startFit}>{fit}</span>
                  <span className={styles.startGo}>
                    Start at {code}
                    <Icon name="arrow-right" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.introRow} aria-labelledby="learn-how">
          <h2 id="learn-how" className={styles.introTitle}>
            How it works
          </h2>
          <ul className={styles.facts}>
            <li>
              {count("lesson")} lessons, {count("checkpoint")} checkpoints and a capstone, about {Math.round(minutes / 60)}
              &nbsp;hours in all. You need only a browser.
            </li>
            <li>Each lesson has a worked example, practice and an exit check. You select answers; nothing runs code.</li>
            <li>A correct exit check completes a lesson. Showing the answer doesn&apos;t, but you can still check afterwards.</li>
          </ul>
        </section>
      </div>

      <div className={styles.path}>
        <StaggerOnce />
        <div className={styles.groups}>
          {layouts.map((layout) => (
            <GroupSection key={layout.group.id} {...layout} />
          ))}
        </div>
        <GroupIndex
          groups={layouts.map((layout) => ({
            id: layout.group.id,
            number: layout.group.number,
            title: layout.group.title,
            lessons: groupLessons(layout).map((lesson) => ({ slug: lesson.slug, revision: lesson.revision })),
          }))}
        />
      </div>
    </main>
  );
}

type Layout = Omit<GroupLayout, "firstRow">;

const groupLessons = (layout: Layout): PublicLesson[] => [
  ...layout.modules.flatMap((item) => item.items),
  ...(layout.trailing ? [layout.trailing] : []),
];

const rowCount = (layout: Layout) => groupLessons(layout).length;

/**
 * A group's modules with their lessons, in course order. A checkpoint that the course places
 * before one of the group's lessons (C4, before the capstone) is listed in that lesson's module,
 * just before it; any other checkpoint is listed after the group's modules.
 */
function layoutGroup(group: LearnGroup): Layout {
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
  return { group, modules, trailing: placed ? null : checkpoint };
}
