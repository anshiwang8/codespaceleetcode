import "server-only";
import { COURSE } from "@/lib/learn/course.generated";
import type { LearnGroup, LearnModule, PublicLesson } from "@/lib/learn/types";

// Server-side views of the course. Pages import these and hand the browser only what one screen
// needs; nothing in a "use client" file may import course.generated.ts (web/tests/learn.test.ts).

export const LEARN_PATH = "/learn";

export const lessonHref = (slug: string) => `${LEARN_PATH}/${slug}`;

export function getLesson(slug: string): PublicLesson | null {
  return Object.hasOwn(COURSE.lessons, slug) ? (COURSE.lessons[slug] ?? null) : null;
}

export function allLessons(): PublicLesson[] {
  return COURSE.order.map((slug) => COURSE.lessons[slug]).filter((lesson): lesson is PublicLesson => lesson !== undefined);
}

export function neighbors(lesson: PublicLesson): { previous: PublicLesson | null; next: PublicLesson | null } {
  const previous = COURSE.order[lesson.position - 1];
  const next = COURSE.order[lesson.position + 1];
  return { previous: previous ? getLesson(previous) : null, next: next ? getLesson(next) : null };
}

export function placeOf(lesson: PublicLesson): { group: LearnGroup | null; learnModule: LearnModule | null } {
  const group = COURSE.groups.find((item) => item.id === lesson.groupId) ?? null;
  const learnModule = group?.modules.find((item) => item.id === lesson.moduleId) ?? null;
  return { group, learnModule };
}

export const displayTitle = (lesson: PublicLesson) => `${lesson.code} ${lesson.title}`;

/** "Suggested first: L01 Values and assignments", or the lesson's own note. */
export function prerequisiteText(lesson: PublicLesson): string | null {
  if (lesson.prerequisiteNote) return `Suggested first: ${lesson.prerequisiteNote}`;
  const names = lesson.prerequisites.map(getLesson).filter((item): item is PublicLesson => item !== null).map(displayTitle);
  return names.length > 0 ? `Suggested first: ${names.join(", ")}` : null;
}
