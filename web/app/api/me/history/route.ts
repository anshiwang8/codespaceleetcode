import { z } from "zod";
import type { HistoryPage } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, positiveIntParam, queryParams, route } from "@/lib/server/http";
import { getHistory, HISTORY_MAX_PAGE_SIZE } from "@/lib/server/profile";

const querySchema = z.strictObject({
  // A cursor from an earlier page: a submission id.
  before: z.string().regex(/^[1-9][0-9]{0,17}$/).optional(),
  limit: positiveIntParam.refine((value) => value <= HISTORY_MAX_PAGE_SIZE).optional(),
});

/** One page of the signed-in user's own submissions, newest first, without the submitted answers. */
export const GET = route("me.history", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your history");
  const parsed = querySchema.safeParse(queryParams(request));
  if (!parsed.success) return errorResponse(400, "Invalid history request");
  return jsonResponse<HistoryPage>(await getHistory(user.id, parsed.data));
});
