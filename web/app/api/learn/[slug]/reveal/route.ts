import type { RevealResponse } from "@/lib/learn/types";
import { errorResponse, isSameOriginRequest, jsonResponse, parseSlug, readJson, route } from "@/lib/server/http";
import { findExercise, revealedAnswer, targetSchema } from "@/lib/server/learn/grade";

interface Context {
  params: Promise<{ slug: string }>;
}

/**
 * Shows one exercise's answer and explanation when the learner asks. It records nothing and
 * completes nothing: completion needs a correct check, which the learner can still make after.
 */
export const POST = route("learn.reveal", async (request, { params }: Context) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Lesson not found");
  const body = targetSchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Name the question to show the answer for");
  const found = findExercise(slug, body.data.revision, body.data.exerciseId);
  if (found.state === "not_found") return errorResponse(404, "Lesson not found");
  if (found.state === "stale") {
    return jsonResponse({ error: "This lesson was updated. Reload the page to see the new version.", revision: found.revision }, 409);
  }
  return jsonResponse<RevealResponse>({ answer: revealedAnswer(found.target), explanation: found.target.key.explanation });
});
