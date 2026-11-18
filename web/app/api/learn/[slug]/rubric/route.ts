import { z } from "zod";
import type { RubricResponse } from "@/lib/learn/types";
import { errorResponse, isSameOriginRequest, jsonResponse, parseSlug, readJson, route } from "@/lib/server/http";
import { findLesson, rubricFor } from "@/lib/server/learn/grade";

interface Context {
  params: Promise<{ slug: string }>;
}

const bodySchema = z.strictObject({ revision: z.number().int().min(1).max(10_000) });

/** The capstone's self-assessment rubric, when the learner asks for it. Nothing is graded or stored. */
export const POST = route("learn.rubric", async (request, { params }: Context) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Lesson not found");
  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Name the lesson's revision");
  const lesson = findLesson(slug);
  const rubric = rubricFor(slug);
  if (!lesson || !rubric) return errorResponse(404, "This lesson has no rubric");
  if (lesson.revision !== body.data.revision) {
    return jsonResponse({ error: "This lesson was updated. Reload the page to see the new version.", revision: lesson.revision }, 409);
  }
  return jsonResponse<RubricResponse>({ rubric });
});
