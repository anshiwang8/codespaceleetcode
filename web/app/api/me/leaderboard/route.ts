import { z } from "zod";
import type { LeaderboardParticipation } from "@/lib/api-types";
import { publicNameField } from "@/lib/leaderboard-name";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";
import { getParticipation, joinLeaderboard, leaveLeaderboard } from "@/lib/server/leaderboard";
import { LEADERBOARD_CHANGE_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

/** Whether the signed-in user appears on the leaderboard, and under which public name. */
export const GET = route("me.leaderboard", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to manage leaderboard visibility");
  return jsonResponse<LeaderboardParticipation>(await getParticipation(user.id));
});

const joinBody = z.strictObject({ publicName: z.string().max(200) });

/** Joins the leaderboard, or changes the public name. Opt-in only: nothing else ever adds a user. */
export const PUT = route("me.leaderboard.join", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to join the leaderboard");
  if (await isRateLimited(`leaderboard:${rateLimitKey(user, request.headers)}`, LEADERBOARD_CHANGE_LIMIT)) {
    return errorResponse(429, "Too many changes. Try again later.");
  }
  const body = joinBody.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Enter a public name");
  const name = publicNameField(body.data.publicName);
  if (!name.ok) return jsonResponse({ error: name.error, fields: { publicName: name.error } }, 400);
  const result = await joinLeaderboard(user.id, name.value);
  if (result.state === "name_taken") {
    const error = "That name is taken. Choose another.";
    return jsonResponse({ error, fields: { publicName: error } }, 409);
  }
  return jsonResponse<LeaderboardParticipation>(result.participation);
});

/** Leaves the leaderboard. The account keeps its points, which only its owner sees. */
export const DELETE = route("me.leaderboard.leave", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to leave the leaderboard");
  if (await isRateLimited(`leaderboard:${rateLimitKey(user, request.headers)}`, LEADERBOARD_CHANGE_LIMIT)) {
    return errorResponse(429, "Too many changes. Try again later.");
  }
  return jsonResponse<LeaderboardParticipation>(await leaveLeaderboard(user.id));
});
