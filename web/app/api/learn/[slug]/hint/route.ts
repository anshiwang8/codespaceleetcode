import { z } from "zod";
import type { HintResponse } from "@/lib/learn/types";
import { errorResponse, isSameOriginRequest, jsonResponse, parseSlug, readJson, route } from "@/lib/server/http";
import { findExercise, targetSchema } from "@/lib/server/learn/grade";

interface Context {
  params: Promise<{ slug: string }>;
}

const bodySchema = targetSchema.extend({ level: z.number().int().min(1).max(3) });

/** One hint for one Learn exercise, on request. Hints cost nothing and aren't recorded. */
export const POST = route("learn.hint", async (request, { params }: Context) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Lesson not found");
  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Ask for a hint by its number");
  const found = findExercise(slug, body.data.revision, body.data.exerciseId);
  if (found.state === "not_found") return errorResponse(404, "Lesson not found");
  if (found.state === "stale") {
    return jsonResponse({ error: "This lesson was updated. Reload the page to see the new version.", revision: found.revision }, 409);
  }
  const hints = found.target.key.hints;
  const hint = hints[body.data.level - 1];
  if (hint === undefined) return errorResponse(404, "There's no hint with that number");
  return jsonResponse<HintResponse>({ level: body.data.level, hint, hintCount: hints.length });
});
