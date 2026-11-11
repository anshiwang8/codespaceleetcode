import { z } from "zod";
import type { ChallengeArchiveResponse } from "@/lib/api-types";
import { PERIOD_KINDS, isPeriodStart } from "@/lib/periods";
import { getCurrentUser } from "@/lib/server/auth";
import { getChallengeArchive } from "@/lib/server/challenges";
import { errorResponse, jsonResponse, queryParams, route } from "@/lib/server/http";
import { BOARD_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

const querySchema = z.strictObject({
  kind: z.enum(PERIOD_KINDS).default("daily"),
  before: z.string().optional(),
});

/** Past challenge periods of one kind, newest first, with the signed-in user's completions. */
export const GET = route("challenges.archive", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (await isRateLimited(`board:${rateLimitKey(user, request.headers)}`, BOARD_LIMIT)) {
    return errorResponse(429, "Too many requests. Try again in a minute.");
  }
  const query = querySchema.safeParse(queryParams(request));
  if (!query.success) return errorResponse(400, "Invalid archive query");
  const { kind, before } = query.data;
  if (before !== undefined && !isPeriodStart(kind, before)) return errorResponse(400, "Invalid archive query");
  return jsonResponse<ChallengeArchiveResponse>(await getChallengeArchive(user?.id ?? null, kind, before ?? null));
});
