import type { AchievementsResponse } from "@/lib/api-types";
import { getAchievements } from "@/lib/server/achievements";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";

/** Every achievement with the signed-in user's progress, earned ones dated. */
export const GET = route("me.achievements", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your achievements");
  return jsonResponse<AchievementsResponse>(await getAchievements(user.id));
});
