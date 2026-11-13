import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CodeBlockView } from "@/components/learn/CodeBlockView";
import { Exercise } from "@/components/learn/Exercise";
import { LessonMarkdown } from "@/components/learn/LessonMarkdown";
import { LessonProgressNote } from "@/components/learn/LessonProgressViews";
import { Reflection } from "@/components/learn/Reflection";
import styles from "@/components/learn/learn.module.css";
import { Icon } from "@/components/site/Icon";
import type { PuzzleSummary } from "@/lib/api-types";
import { browseHref, DEFAULT_GROUPING } from "@/lib/browse";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { COURSE } from "@/lib/learn/course.generated";
import { LEARN_PATH, displayTitle, getLesson, lessonHref, neighbors, placeOf, prerequisiteText } from "@/lib/learn/course";
import type { PublicLesson } from "@/lib/learn/types";
import { listPuzzles } from "@/lib/server/puzzles";
import { topicLabel } from "@/lib/topics";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const lesson = getLesson((await params).slug);
  return lesson ? { title: displayTitle(lesson), description: lesson.summary } : { title: "Lesson not found" };
}

/** Practice links only for puzzles this site has published, from the cached public catalog. */
async function publishedPractice(lesson: PublicLesson): Promise<PuzzleSummary[] | null> {
  if (lesson.practice.length === 0) return [];
  try {
    const { puzzles } = await listPuzzles(null, {});
    const bySlug = new Map(puzzles.map((puzzle) => [puzzle.slug, puzzle]));
    return lesson.practice.map((slug) => bySlug.get(slug)).filter((puzzle): puzzle is PuzzleSummary => puzzle !== undefined);
  } catch {
    return null;
  }
}

export default async function LessonPage({ params }: PageProps) {
  const lesson = getLesson((await params).slug);
  if (!lesson) notFound();
  // Rendered per request so practice links follow what's published; the lesson itself is the
  // same for everyone, and progress fills in on the client.
  await connection();
  const practice = await publishedPractice(lesson);
  const { group, learnModule } = placeOf(lesson);
  const { previous, next } = neighbors(lesson);
  const prerequisite = prerequisiteText(lesson);
  const blocks = new Map(lesson.codeBlocks.map((block) => [block.id, block]));
  const exampleBlocks = new Set(lesson.example?.blocks ?? []);
  const lineBlocks = new Set(lesson.exercises.filter((exercise) => exercise.kind === "line").map((exercise) => exercise.block));
  // Code the learner reads before the questions: everything but the example's own and, in a
  // lesson, the blocks that only exist to be selected. Checkpoints and the capstone show all of it.
  const readingBlocks = lesson.codeBlocks.filter(
    (block) => !exampleBlocks.has(block.id) && (lesson.kind !== "lesson" || !lineBlocks.has(block.id)),
  );

  return (
    <main className={`page ${styles.page} ${styles.lessonPage}`} data-testid="lesson" data-lesson={lesson.slug}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href={LEARN_PATH}>Learn</Link>
          </li>
          {group ? <li>Group {group.number}: {group.title}</li> : null}
          {learnModule ? <li>Module {learnModule.number}: {learnModule.title}</li> : null}
        </ol>
      </nav>

      <header className={styles.lessonHeader}>
        <h1 className="page-title">
          <span className={styles.lessonCode}>{lesson.code}</span> {lesson.title}
        </h1>
        <p className={styles.catalogMeta}>
          <span>
            <Icon name="clock" /> {lesson.minutes} min
          </span>
          {lesson.badge ? <span>{lesson.badge}</span> : null}
          {prerequisite ? <span>{prerequisite}</span> : null}
        </p>
        <LessonProgressNote slug={lesson.slug} revision={lesson.revision} requiredCount={lesson.requiredIds.length} />
      </header>

      <section className={styles.block} aria-labelledby="outcome">
        <h2 id="outcome" className={styles.blockTitle}>
          Outcome
        </h2>
        <LessonMarkdown source={lesson.objective} />
      </section>

      {lesson.teach ? (
        <section className={styles.block} aria-labelledby="teach">
          <h2 id="teach" className={styles.blockTitle}>
            Learn
          </h2>
          <LessonMarkdown source={lesson.teach} />
        </section>
      ) : null}

      {lesson.scenario || readingBlocks.length > 0 ? (
        <section className={styles.block} aria-labelledby="scenario">
          <h2 id="scenario" className={styles.blockTitle}>
            {lesson.kind === "lesson" ? "Code" : "The case"}
          </h2>
          {lesson.scenario ? <LessonMarkdown source={lesson.scenario} /> : null}
          {readingBlocks.map((block) => (
            <CodeBlockView key={block.id} block={block} />
          ))}
        </section>
      ) : null}

      {lesson.example ? (
        <section className={styles.block} aria-labelledby="example">
          <h2 id="example" className={styles.blockTitle}>
            Worked example
          </h2>
          <LessonMarkdown source={lesson.example.prompt} />
          {(lesson.example.blocks ?? []).map((id) => {
            const block = blocks.get(id);
            return block ? <CodeBlockView key={id} block={block} /> : null;
          })}
          <details className={styles.worked} data-testid="worked-example">
            <summary>Predict first, then show the worked explanation</summary>
            <LessonMarkdown source={lesson.example.explanation} />
          </details>
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="checks">
        <h2 id="checks" className={styles.blockTitle}>
          {lesson.kind === "lesson" ? "Practice and check" : lesson.kind === "capstone" ? "Investigation tasks" : "Checkpoint items"}
        </h2>
        <div className={styles.exercises}>
          {lesson.exercises.map((exercise) => {
            const review = exercise.review ? getLesson(exercise.review) : null;
            return (
              <Exercise
                key={exercise.id}
                slug={lesson.slug}
                revision={lesson.revision}
                requiredIds={lesson.requiredIds}
                exercise={exercise}
                prompt={<LessonMarkdown source={exercise.prompt} />}
                block={exercise.block ? blocks.get(exercise.block) : undefined}
                review={review ? { href: lessonHref(review.slug), title: displayTitle(review) } : undefined}
              />
            );
          })}
          {lesson.reflection ? (
            <Reflection slug={lesson.slug} revision={lesson.revision} prompt={<LessonMarkdown source={lesson.reflection.prompt} />} />
          ) : null}
        </div>
      </section>

      {lesson.mistake ? (
        <section className={styles.block} aria-labelledby="mistake">
          <h2 id="mistake" className={styles.blockTitle}>
            Common mistake
          </h2>
          <LessonMarkdown source={lesson.mistake} />
        </section>
      ) : null}

      {lesson.after ? (
        <section className={styles.block} aria-labelledby="after">
          <h2 id="after" className={styles.blockTitle}>
            {lesson.kind === "capstone" ? "After the tasks" : "Review"}
          </h2>
          <LessonMarkdown source={lesson.after} />
        </section>
      ) : null}

      {lesson.next ? (
        <section className={styles.block} aria-labelledby="next-up">
          <h2 id="next-up" className={styles.blockTitle}>
            Next
          </h2>
          <LessonMarkdown source={lesson.next} />
        </section>
      ) : null}

      {lesson.transfer || lesson.practice.length > 0 || lesson.topics.length > 0 ? (
        <section className={styles.block} aria-labelledby="practice" data-testid="practice">
          <h2 id="practice" className={styles.blockTitle}>
            Practice on a real repository
          </h2>
          {lesson.transfer ? <LessonMarkdown source={lesson.transfer} /> : null}
          {practice === null ? (
            <p className={styles.muted}>The practice puzzles couldn&apos;t be loaded right now. Browse them from Puzzles.</p>
          ) : practice.length > 0 ? (
            <ul className={styles.practiceList}>
              {practice.map((puzzle) => (
                <li key={puzzle.slug}>
                  <Link href={`/puzzles/${puzzle.slug}`} data-testid={`practice-${puzzle.slug}`}>
                    {puzzle.title}
                  </Link>
                  <span className={styles.practiceMeta}>
                    {TYPE_LABELS[puzzle.type]} · {DIFFICULTY_LABELS[puzzle.difficulty]} · {puzzle.repoSlug}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {lesson.topics.length > 0 ? (
            <p className={styles.topics}>
              Related topics:{" "}
              {lesson.topics.map((topic, index) => (
                <span key={topic}>
                  {index > 0 ? ", " : ""}
                  <Link href={browseHref({ filters: { tag: topic }, group: DEFAULT_GROUPING })}>{topicLabel(topic)}</Link>
                </span>
              ))}
            </p>
          ) : null}
          <p className={styles.muted}>
            Practice is optional. Solving a puzzle doesn&apos;t complete a lesson, and lessons never change a puzzle&apos;s points.
          </p>
        </section>
      ) : null}

      {lesson.references.length > 0 ? (
        <section className={styles.block} aria-labelledby="references">
          <h2 id="references" className={styles.blockTitle}>
            References
          </h2>
          <ul className={styles.references}>
            {lesson.references.map((id) => {
              const reference = COURSE.references[id];
              return reference ? (
                <li key={id}>
                  <a href={reference.url} target="_blank" rel="noreferrer noopener">
                    {reference.title}
                  </a>{" "}
                  <span className={styles.muted}>({reference.source})</span>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ) : null}

      <nav className={styles.pager} aria-label="Lessons">
        {previous ? (
          <Link href={lessonHref(previous.slug)} rel="prev" data-testid="previous-lesson">
            <span className={styles.pagerLabel}>Previous</span>
            {displayTitle(previous)}
          </Link>
        ) : (
          <Link href={LEARN_PATH}>
            <span className={styles.pagerLabel}>Back to</span>
            All lessons
          </Link>
        )}
        {next ? (
          <Link href={lessonHref(next.slug)} rel="next" className={styles.pagerNext} data-testid="next-lesson">
            <span className={styles.pagerLabel}>Next</span>
            {displayTitle(next)}
          </Link>
        ) : (
          <Link href={LEARN_PATH} className={styles.pagerNext}>
            <span className={styles.pagerLabel}>Finished?</span>
            All lessons
          </Link>
        )}
      </nav>
    </main>
  );
}
