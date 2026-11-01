import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";
import { getStats } from "@/lib/server/puzzles";

export const GET = route("me.stats", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your stats");
  return jsonResponse(await getStats(user.id));
});
