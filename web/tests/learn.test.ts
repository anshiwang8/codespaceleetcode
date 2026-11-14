import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as checkRoute } from "@/app/api/learn/[slug]/check/route";
import { POST as hintRoute } from "@/app/api/learn/[slug]/hint/route";
import { POST as revealRoute } from "@/app/api/learn/[slug]/reveal/route";
import { POST as rubricRoute } from "@/app/api/learn/[slug]/rubric/route";
import { GET as myLearnRoute } from "@/app/api/me/learn/route";
import { codeLines } from "@/lib/learn/code";
import { statusOf } from "@/lib/learn/status";
import { COURSE } from "@/lib/learn/course.generated";
import type { CheckResponse, LearnAnswer, LearnProgressResponse, PublicLesson } from "@/lib/learn/types";
import { getPool } from "@/lib/server/db";
import { findExercise, grade, revealedAnswer } from "@/lib/server/learn/grade";
import { KEYS } from "@/lib/server/learn/keys.generated";
import { seedFixtures } from "./fixtures";
import { hasDatabase, makeRequest, params, signIn } from "./helpers";

const ORIGIN = "http://localhost:3000";
const WEB = path.resolve(__dirname, "..");

function lesson(slug: string): PublicLesson {
  const found = COURSE.lessons[slug];
  if (!found) throw new Error(`no lesson ${slug}`);
  return found;
}

function call(route: typeof checkRoute, slug: string, action: string, body: unknown, cookie?: string, origin: string | null = ORIGIN) {
  return route(
    makeRequest(`/api/learn/${slug}/${action}`, { cookie, body, headers: origin ? { origin } : {} }),
    params({ slug }),
  );
}

const check = (slug: string, exerciseId: string, answer: LearnAnswer, cookie?: string, revision = lesson(slug).revision) =>
  call(checkRoute, slug, "check", { revision, exerciseId, answer }, cookie);

/** The right answer for one exercise, from the key, so tests don't repeat it. */
function correctAnswer(slug: string, exerciseId: string): LearnAnswer {
  const found = findExercise(slug, lesson(slug).revision, exerciseId);
  if (found.state !== "ok") throw new Error(`no exercise ${slug}/${exerciseId}`);
  return revealedAnswer(found.target);
}

function wrongAnswer(slug: string, exerciseId: string): LearnAnswer {
  const right = correctAnswer(slug, exerciseId);
  const exercise = lesson(slug).exercises.find((item) => item.id === exerciseId);
  if (right.kind === "choice") {
    const other = exercise?.choices?.find((choice) => choice.id !== right.choiceId);
    return { kind: "choice", choiceId: other?.id ?? "" };
  }
  if (right.kind === "line") return { kind: "line", line: right.line === 1 ? 2 : 1 };
  return { kind: "sequence", steps: [...right.steps].reverse() };
}

describe("the generated course", () => {
  it("holds all 24 lessons, 4 checkpoints and the capstone, in eight modules and four groups", () => {
    const lessons = Object.values(COURSE.lessons);
    expect(COURSE.groups).toHaveLength(4);
    expect(COURSE.groups.flatMap((group) => group.modules)).toHaveLength(8);
    expect(COURSE.order).toHaveLength(28);
    expect(lessons.filter((item) => item.kind === "lesson")).toHaveLength(23);
    expect(lessons.filter((item) => item.kind === "checkpoint").map((item) => item.code)).toEqual(["C1", "C2", "C3", "C4"]);
    expect(lessons.filter((item) => item.kind === "capstone").map((item) => item.code)).toEqual(["L24"]);
    const codes = COURSE.order.map((slug) => lesson(slug).code);
    expect(codes.filter((code) => code.startsWith("L"))).toEqual(Array.from({ length: 24 }, (_, index) => `L${String(index + 1).padStart(2, "0")}`));
    // C4 sits after L23 and before the capstone.
    expect(codes.slice(-3)).toEqual(["L23", "C4", "L24"]);
    expect(lesson("codebase-investigation-capstone").requiredIds).toEqual(["find", "trace", "architecture", "design"]);
  });

  it("has a key for every exercise and nothing else, with the same kind, role and revision", () => {
    expect(Object.keys(KEYS).sort()).toEqual([...COURSE.order].sort());
    for (const slug of COURSE.order) {
      const item = lesson(slug);
      const keys = KEYS[slug];
      expect(keys?.revision, slug).toBe(item.revision);
      expect(Object.keys(keys?.exercises ?? {}).sort(), slug).toEqual(item.exercises.map((exercise) => exercise.id).sort());
      for (const exercise of item.exercises) {
        const key = keys?.exercises[exercise.id];
        expect(key?.kind).toBe(exercise.kind);
        expect(key?.role).toBe(exercise.role);
        expect(key?.hints.length).toBe(exercise.hintCount);
      }
    }
  });

  it("keeps every answer, explanation, hint, feedback and rubric out of the public module", () => {
    const publicText = readFileSync(path.join(WEB, "lib/learn/course.generated.ts"), "utf8");
    // No key property anywhere in the public data (an option may be *called* "key"; a property can't).
    expect(publicText).not.toMatch(/"(answer|explanation|hints|feedback|rubric|key|authorNotes)"\s*:/);
    for (const keys of Object.values(KEYS)) {
      for (const key of Object.values(keys.exercises)) {
        for (const text of [key.explanation, ...key.hints, ...Object.values(key.feedback)]) {
          expect(publicText.includes(JSON.stringify(text).slice(1, -1)), text).toBe(false);
        }
      }
      if (keys.rubric) expect(publicText).not.toContain(JSON.stringify(keys.rubric).slice(1, 60));
    }
  });

  it("is imported by no browser code: no 'use client' file reaches the course data or the keys", () => {
    const offenders: string[] = [];
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const full = path.join(directory, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|mts)$/.test(name)) {
          const text = readFileSync(full, "utf8");
          if (!/^\s*["']use client["']/.test(text)) continue;
          if (/learn\/course\.generated|server\/learn|lib\/learn\/course["']/.test(text)) offenders.push(path.relative(WEB, full));
        }
      }
    };
    for (const directory of ["app", "components", "lib"]) walk(path.join(WEB, directory));
    expect(offenders).toEqual([]);
    expect(readFileSync(path.join(WEB, "lib/server/learn/keys.generated.ts"), "utf8")).toMatch(/^(\/\/.*\n)+import "server-only";/);
  });

  it("numbers code lines the way the validator does, so line answers point at real lines", () => {
    expect(codeLines("a\nb\n")).toEqual(["a", "b"]);
    for (const slug of COURSE.order) {
      for (const exercise of lesson(slug).exercises.filter((item) => item.kind === "line")) {
        const block = lesson(slug).codeBlocks.find((item) => item.id === exercise.block);
        const answer = correctAnswer(slug, exercise.id);
        expect(block, `${slug}/${exercise.id}`).toBeDefined();
        if (answer.kind === "line" && block) expect(codeLines(block.source)[answer.line - 1]?.trim()).not.toBe("");
      }
    }
  });
});

describe("lesson status", () => {
  it("is complete, in progress, updated or not started, judged against the current revision", () => {
    const done = { revision: 1, correct: ["exit"], completedAt: "2026-11-13T00:00:00.000Z" };
    expect(statusOf(undefined, 1)).toBe("none");
    expect(statusOf([done], 1)).toBe("complete");
    expect(statusOf([{ revision: 2, correct: ["branch"], completedAt: null }], 2)).toBe("started");
    // Finished revision 1, and the lesson is now revision 2: review it.
    expect(statusOf([done], 2)).toBe("updated");
    expect(statusOf([{ revision: 2, correct: ["exit"], completedAt: "2026-11-14T00:00:00.000Z" }, done], 2)).toBe("complete");
    expect(statusOf([{ revision: 1, correct: [], completedAt: null }], 1)).toBe("none");
  });
});

describe("grading", () => {
  const target = (slug: string, id: string) => {
    const found = findExercise(slug, lesson(slug).revision, id);
    if (found.state !== "ok") throw new Error("missing");
    return found.target;
  };

  it("grades a choice exactly and refuses an unknown one", () => {
    expect(grade(target("values-and-assignments", "exit"), { kind: "choice", choiceId: "8" })).toMatchObject({ state: "graded", correct: true });
    const wrong = grade(target("values-and-assignments", "exit"), { kind: "choice", choiceId: "2" });
    expect(wrong).toMatchObject({ state: "graded", correct: false, explanation: null });
    expect(grade(target("values-and-assignments", "exit"), { kind: "choice", choiceId: "eight" })).toMatchObject({ state: "invalid" });
    expect(grade(target("values-and-assignments", "exit"), { kind: "line", line: 1 })).toMatchObject({ state: "invalid" });
  });

  it("gives a wrong choice its own feedback when there is some, and never the answer", () => {
    const result = grade(target("values-and-assignments", "guided"), { kind: "choice", choiceId: "10" });
    expect(result).toMatchObject({ state: "graded", correct: false });
    if (result.state === "graded") {
      expect(result.feedback).toContain("line 4");
      expect(result.feedback).not.toContain("11");
    }
  });

  it("grades a selected line, and refuses one outside the code", () => {
    const find = target("codebase-investigation-capstone", "find");
    expect(grade(find, { kind: "line", line: 3 })).toMatchObject({ correct: true });
    expect(grade(find, { kind: "line", line: 4 })).toMatchObject({ correct: false });
    expect(grade(find, { kind: "line", line: 99 })).toMatchObject({ state: "invalid" });
  });

  it("grades a sequence in order: wrong order, a missing step and an extra step are all wrong", () => {
    const trace = target("codebase-investigation-capstone", "trace");
    const right = ["get-report", "load-report", "cache-get", "store-read", "cache-set"];
    expect(grade(trace, { kind: "sequence", steps: right })).toMatchObject({ correct: true });
    expect(grade(trace, { kind: "sequence", steps: ["load-report", "get-report", "cache-get", "store-read", "cache-set"] })).toMatchObject({ correct: false });
    expect(grade(trace, { kind: "sequence", steps: right.slice(0, 4) })).toMatchObject({ correct: false });
    expect(grade(trace, { kind: "sequence", steps: ["get-report", "number-is-integer", ...right.slice(1)] })).toMatchObject({ correct: false });
    expect(grade(trace, { kind: "sequence", steps: [...right, "get-report"] })).toMatchObject({ state: "invalid" });
    expect(grade(trace, { kind: "sequence", steps: ["get-report", "unknown-step"] })).toMatchObject({ state: "invalid" });
  });

  it("accepts every authored answer and rejects every other choice", () => {
    for (const slug of COURSE.order) {
      for (const exercise of lesson(slug).exercises) {
        const found = target(slug, exercise.id);
        expect(grade(found, correctAnswer(slug, exercise.id)), `${slug}/${exercise.id}`).toMatchObject({ correct: true });
        for (const choice of exercise.choices ?? []) {
          const result = grade(found, { kind: "choice", choiceId: choice.id });
          const right = correctAnswer(slug, exercise.id);
          expect(result).toMatchObject({ correct: right.kind === "choice" && right.choiceId === choice.id });
        }
      }
    }
  });
});

describe.skipIf(!hasDatabase)("the Learn API", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const rows = async (cookieLogin: string) => {
    const { rows } = await getPool().query<{ lesson_slug: string; revision: number; correct: string[]; completed_at: Date | null }>(
      "select lesson_slug, revision, correct, completed_at from learn_progress where user_id = (select id from users where github_login = $1)",
      [cookieLogin],
    );
    return rows;
  };

  it("refuses requests from other sites, unknown lessons and exercises, bad bodies, and stale revisions", async () => {
    const slug = "values-and-assignments";
    const answer: LearnAnswer = { kind: "choice", choiceId: "8" };
    expect((await call(checkRoute, slug, "check", { revision: 1, exerciseId: "exit", answer }, undefined, null)).status).toBe(403);
    expect((await call(checkRoute, slug, "check", { revision: 1, exerciseId: "exit", answer }, undefined, "https://evil.example")).status).toBe(403);
    expect((await check("no-such-lesson", "exit", answer, undefined, 1)).status).toBe(404);
    expect((await check(slug, "no-such-exercise", answer)).status).toBe(404);
    expect((await call(checkRoute, slug, "check", { revision: 1, exerciseId: "exit" })).status).toBe(400);
    expect((await call(checkRoute, slug, "check", { revision: 1, exerciseId: "exit", answer: { kind: "text", text: "8" } })).status).toBe(400);
    expect((await call(checkRoute, slug, "check", { revision: 1, exerciseId: "exit", answer, extra: true })).status).toBe(400);
    const stale = await check(slug, "exit", answer, undefined, lesson(slug).revision + 1);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ revision: lesson(slug).revision });
    expect(stale.headers.get("cache-control")).toBe("no-store");
  });

  it("tells a guest whether they're right without recording anything or touching the database", async () => {
    const spy = vi.spyOn(getPool(), "query");
    const wrong = await check("values-and-assignments", "exit", { kind: "choice", choiceId: "2" });
    const wrongBody = (await wrong.json()) as CheckResponse & Record<string, unknown>;
    expect(wrongBody).toMatchObject({ correct: false, explanation: null, progress: null });
    expect(wrongBody).not.toHaveProperty("answer");
    expect(JSON.stringify(wrongBody)).not.toContain(KEYS["values-and-assignments"]?.exercises.exit?.explanation ?? "unset");
    const right = await check("values-and-assignments", "exit", { kind: "choice", choiceId: "8" });
    expect(await right.json()).toMatchObject({ correct: true, progress: null });
    expect(right.headers.get("cache-control")).toBe("no-store");
    expect(spy).not.toHaveBeenCalled();
  });

  it("records a signed-in user's correct required answer, and completes a one-check lesson", async () => {
    const cookie = await signIn("learn-one");
    const wrong = (await (await check("values-and-assignments", "exit", wrongAnswer("values-and-assignments", "exit"), cookie)).json()) as CheckResponse;
    expect(wrong.progress).toBeNull();
    expect(await rows("learn-one")).toEqual([]);
    // Practice questions never count.
    await check("values-and-assignments", "guided", correctAnswer("values-and-assignments", "guided"), cookie);
    expect(await rows("learn-one")).toEqual([]);
    const right = (await (await check("values-and-assignments", "exit", correctAnswer("values-and-assignments", "exit"), cookie)).json()) as CheckResponse;
    expect(right.progress).toMatchObject({ revision: 1, correct: ["exit"] });
    expect(right.progress?.completedAt).toEqual(expect.any(String));
    // Checking again changes nothing, including when it was completed.
    const again = (await (await check("values-and-assignments", "exit", correctAnswer("values-and-assignments", "exit"), cookie)).json()) as CheckResponse;
    expect(again.progress?.completedAt).toBe(right.progress?.completedAt);
    expect(await rows("learn-one")).toHaveLength(1);
  });

  it("completes a checkpoint only once all three items are correct, whatever the order", async () => {
    const cookie = await signIn("learn-checkpoint");
    const slug = "c1-receipt-trace";
    const first = (await (await check(slug, "return", correctAnswer(slug, "return"), cookie)).json()) as CheckResponse;
    expect(first.progress).toMatchObject({ correct: ["return"], completedAt: null });
    const second = (await (await check(slug, "branch", correctAnswer(slug, "branch"), cookie)).json()) as CheckResponse;
    expect(second.progress).toMatchObject({ correct: ["branch", "return"], completedAt: null });
    await check(slug, "state", wrongAnswer(slug, "state"), cookie);
    expect((await rows("learn-checkpoint"))[0]?.completed_at).toBeNull();
    const third = (await (await check(slug, "state", correctAnswer(slug, "state"), cookie)).json()) as CheckResponse;
    expect(third.progress).toMatchObject({ correct: ["branch", "return", "state"] });
    expect(third.progress?.completedAt).toEqual(expect.any(String));
  });

  it("completes the capstone only after all four tasks; the reflection is never graded", async () => {
    const cookie = await signIn("learn-capstone");
    const slug = "codebase-investigation-capstone";
    for (const id of ["find", "trace", "architecture"]) await check(slug, id, correctAnswer(slug, id), cookie);
    expect((await rows("learn-capstone"))[0]?.completed_at).toBeNull();
    const last = (await (await check(slug, "design", correctAnswer(slug, "design"), cookie)).json()) as CheckResponse;
    expect(last.progress?.completedAt).toEqual(expect.any(String));
    const rubric = await call(rubricRoute, slug, "rubric", { revision: lesson(slug).revision });
    expect(await rubric.json()).toMatchObject({ rubric: expect.stringContaining("one point") });
    expect((await call(rubricRoute, "values-and-assignments", "rubric", { revision: 1 })).status).toBe(404);
  });

  it("reveals an answer without completing anything, and gives hints one level at a time", async () => {
    const cookie = await signIn("learn-reveal");
    const revealed = await call(revealRoute, "values-and-assignments", "reveal", { revision: 1, exerciseId: "exit" }, cookie);
    expect(await revealed.json()).toMatchObject({ answer: { kind: "choice", choiceId: "8" } });
    expect(await rows("learn-reveal")).toEqual([]);
    const hint = await call(hintRoute, "values-and-assignments", "hint", { revision: 1, exerciseId: "guided", level: 1 }, cookie);
    expect(await hint.json()).toMatchObject({ level: 1, hintCount: 1, hint: expect.any(String) });
    expect((await call(hintRoute, "values-and-assignments", "hint", { revision: 1, exerciseId: "guided", level: 2 })).status).toBe(404);
    expect((await call(hintRoute, "values-and-assignments", "hint", { revision: 1, exerciseId: "exit", level: 1 })).status).toBe(404);
    expect((await call(hintRoute, "values-and-assignments", "hint", { revision: 1, exerciseId: "guided", level: 0 })).status).toBe(400);
  });

  it("shows each user only their own progress, privately, and nothing signed out", async () => {
    const first = await signIn("learn-mine");
    const second = await signIn("learn-theirs");
    await check("branches-and-comparisons", "exit", correctAnswer("branches-and-comparisons", "exit"), first);
    const mine = await myLearnRoute(makeRequest("/api/me/learn", { cookie: first }), undefined);
    expect(mine.headers.get("cache-control")).toBe("no-store");
    expect(((await mine.json()) as LearnProgressResponse).lessons.map((item) => item.slug)).toEqual(["branches-and-comparisons"]);
    const theirs = (await (await myLearnRoute(makeRequest("/api/me/learn", { cookie: second }), undefined)).json()) as LearnProgressResponse;
    expect(theirs.lessons).toEqual([]);
    expect((await myLearnRoute(makeRequest("/api/me/learn"), undefined)).status).toBe(401);
  });

  it("keeps an older revision's completion when the lesson changes, and records the new one apart", async () => {
    const cookie = await signIn("learn-revised");
    const id = (await getPool().query<{ id: string }>("select id from users where github_login = 'learn-revised'")).rows[0]?.id;
    await getPool().query(
      "insert into learn_progress (user_id, lesson_slug, revision, correct, completed_at) values ($1, 'values-and-assignments', 0 + 1, '{exit}', now())",
      [id],
    );
    // Pretend the content moved to revision 2: an old page's check is refused as stale.
    const stale = await check("values-and-assignments", "exit", correctAnswer("values-and-assignments", "exit"), cookie, 2);
    expect(stale.status).toBe(409);
    const progress = (await (await myLearnRoute(makeRequest("/api/me/learn", { cookie }), undefined)).json()) as LearnProgressResponse;
    expect(progress.lessons).toEqual([
      { slug: "values-and-assignments", revision: 1, correct: ["exit"], completedAt: expect.any(String) },
    ]);
  });
});
