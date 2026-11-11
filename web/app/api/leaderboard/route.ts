import { z } from "zod";
import type { LeaderboardResponse } from "@/lib/api-types";
import { LEADERBOARD_PERIODS } from "@/lib/periods";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, positiveIntParam, queryParams, route } from "@/lib/server/http";
import { MAX_LEADERBOARD_PAGE, getLeaderboard } from "@/lib/server/leaderboard";
import { BOARD_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

const querySchema = z.strictObject({
  period: z.enum(LEADERBOARD_PERIODS).default("all"),
  page: positiveIntParam.refine((page) => page <= MAX_LEADERBOARD_PAGE).default(1),
});

/** One page of a period's rankings, opted-in users only, and the signed-in user's own standing. */
export const GET = route("leaderboard", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (await isRateLimited(`board:${rateLimitKey(user, request.headers)}`, BOARD_LIMIT)) {
    return errorResponse(429, "Too many requests. Try again in a minute.");
  }
  const query = querySchema.safeParse(queryParams(request));
  if (!query.success) return errorResponse(400, "Invalid leaderboard query");
  return jsonResponse<LeaderboardResponse>(
    await getLeaderboard(user?.id ?? null, query.data.period, query.data.page),
  );
});
