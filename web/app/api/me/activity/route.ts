import { z } from "zod";
import type { ActivityResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, queryParams, route } from "@/lib/server/http";
import { getActivity, parsePeriodKey } from "@/lib/server/profile";

const querySchema = z.strictObject({ period: z.string().max(8).optional() });

/**
 * The signed-in user's activity calendar and first-solve timeline for one period: "rolling" (the
 * last 365 UTC dates) or a calendar year from their history. A year outside it is a 400.
 */
export const GET = route("me.activity", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your activity");
  const parsed = querySchema.safeParse(queryParams(request));
  const key = parsed.success ? parsePeriodKey(parsed.data.period) : null;
  if (!key) return errorResponse(400, "Invalid activity period");
  const activity = await getActivity(user.id, key);
  if (!activity) return errorResponse(400, "Invalid activity period");
  return jsonResponse<ActivityResponse>(activity);
});
