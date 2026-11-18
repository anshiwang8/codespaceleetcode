import type { LearnProgressResponse } from "@/lib/learn/types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";
import { getLearnProgress } from "@/lib/server/learn/progress";

/** The signed-in user's own Learn progress. Private and no-store, like everything under /api/me. */
export const GET = route("me.learn", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your Learn progress");
  return jsonResponse<LearnProgressResponse>(await getLearnProgress(user.id));
});
