import type { ChallengesResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { getChallenges } from "@/lib/server/challenges";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";
import { BOARD_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

/** This period's daily, weekly and monthly challenges, and the signed-in user's progress on them. */
export const GET = route("challenges", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (await isRateLimited(`board:${rateLimitKey(user, request.headers)}`, BOARD_LIMIT)) {
    return errorResponse(429, "Too many requests. Try again in a minute.");
  }
  return jsonResponse<ChallengesResponse>(await getChallenges(user?.id ?? null));
});
