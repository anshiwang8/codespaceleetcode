import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, parseSlug, readJson, route } from "@/lib/server/http";
import { isRateLimited, rateLimitKey, SUBMIT_LIMIT } from "@/lib/server/rate-limit";
import { submissionSchema, submitAnswer } from "@/lib/server/submit";

interface Context {
  params: Promise<{ slug: string }>;
}

export const POST = route("puzzles.submit", async (request, { params }: Context) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to submit an answer");
  if (await isRateLimited(`submit:${rateLimitKey(user, request.headers)}`, SUBMIT_LIMIT)) {
    return errorResponse(429, "Too many submissions. Try again in a minute.");
  }
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Puzzle not found");
  const submission = submissionSchema.safeParse(await readJson(request));
  if (!submission.success) return errorResponse(400, "Invalid submission");

  const result = await submitAnswer(user.id, slug, submission.data);
  switch (result.state) {
    case "not_found":
      return errorResponse(404, "Puzzle not found");
    case "wrong_kind":
      return errorResponse(400, "This puzzle takes a different kind of answer");
    case "unknown_reference":
      return errorResponse(400, "That answer refers to something not in this snapshot");
    case "graded":
      return jsonResponse(result.response);
  }
});
