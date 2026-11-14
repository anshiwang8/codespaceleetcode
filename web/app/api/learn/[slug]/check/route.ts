import type { CheckResponse } from "@/lib/learn/types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, isSameOriginRequest, jsonResponse, parseSlug, readJson, route } from "@/lib/server/http";
import { answerSchema, findExercise, grade, targetSchema } from "@/lib/server/learn/grade";
import { recordCorrect } from "@/lib/server/learn/progress";
import { LEARN_CHECK_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

interface Context {
  params: Promise<{ slug: string }>;
}

const bodySchema = targetSchema.extend({ answer: answerSchema });

/**
 * Grades one Learn exercise. Anyone can check; for a signed-in user a correct required answer is
 * also recorded, and completes the lesson when it was the last one missing. The response never
 * holds the key: a wrong answer gets feedback, a right one its explanation. Always no-store.
 */
export const POST = route("learn.check", async (request, { params }: Context) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Lesson not found");
  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Choose an answer, then check it");
  const found = findExercise(slug, body.data.revision, body.data.exerciseId);
  if (found.state === "not_found") return errorResponse(404, "Lesson not found");
  if (found.state === "stale") {
    return jsonResponse({ error: "This lesson was updated. Reload the page to see the new version.", revision: found.revision }, 409);
  }
  const result = grade(found.target, body.data.answer);
  if (result.state === "invalid") return errorResponse(400, result.error);

  const user = await getCurrentUser(request.headers);
  let progress: CheckResponse["progress"] = null;
  if (user) {
    if (await isRateLimited(`learn:${rateLimitKey(user, request.headers)}`, LEARN_CHECK_LIMIT)) {
      return errorResponse(429, "Too many checks. Try again in a minute.");
    }
    const { lesson, exercise } = found.target;
    if (result.correct && exercise.role === "required") {
      progress = await recordCorrect(user.id, lesson.slug, lesson.revision, exercise.id, lesson.requiredIds);
    }
  }
  return jsonResponse<CheckResponse>({
    correct: result.correct,
    feedback: result.feedback,
    explanation: result.explanation,
    progress,
  });
});

