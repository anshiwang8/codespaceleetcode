import type { HintRevealResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { hintRevealSchema, revealHint } from "@/lib/server/hints";
import { errorResponse, isSameOriginRequest, jsonResponse, parseSlug, readJson, route } from "@/lib/server/http";
import { HINT_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

interface Context {
  params: Promise<{ slug: string }>;
}

/**
 * Reveals the next hint level and records it for scoring. Body: `{ "level": n }`, where n is one
 * more than the levels already revealed (asking for a revealed level again is harmless).
 */
export const POST = route("puzzles.hints", async (request, { params }: Context) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to reveal hints");
  if (await isRateLimited(`hints:${rateLimitKey(user, request.headers)}`, HINT_LIMIT)) {
    return errorResponse(429, "Too many requests. Try again in a minute.");
  }
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Puzzle not found");
  const body = hintRevealSchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Choose a hint level from 1 to 3");

  const result = await revealHint(user.id, slug, body.data.level);
  switch (result.state) {
    case "not_found":
      return errorResponse(404, "Puzzle not found");
    case "no_such_level":
      return errorResponse(400, "This puzzle has no hint at that level");
    case "out_of_order":
      return errorResponse(409, "Reveal the earlier hints first");
    case "ok":
      return jsonResponse<HintRevealResponse>(result.response);
  }
});
