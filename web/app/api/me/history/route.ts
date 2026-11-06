import { z } from "zod";
import type { HistoryPage } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, positiveIntParam, queryParams, route, textValue } from "@/lib/server/http";
import { getHistory, HISTORY_MAX_PAGE_SIZE } from "@/lib/server/profile";

/** A real YYYY-MM-DD calendar date, so Postgres never sees one it would reject. */
const utcDateParam = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  });

const querySchema = z.strictObject({
  // A cursor from an earlier page: a submission id.
  before: z.string().regex(/^[1-9][0-9]{0,17}$/).optional(),
  limit: positiveIntParam.refine((value) => value <= HISTORY_MAX_PAGE_SIZE).optional(),
  type: z.enum(["find", "trace", "architecture"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  repo: textValue(200).optional(),
  outcome: z.enum(["passed", "failed"]).optional(),
  date: utcDateParam.optional(),
});

/**
 * One page of the signed-in user's own submissions, newest first, without the submitted answers.
 * Filters narrow the whole history on the server; the cursor continues the same filtered list.
 */
export const GET = route("me.history", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your history");
  const parsed = querySchema.safeParse(queryParams(request));
  if (!parsed.success) return errorResponse(400, "Invalid history request");
  return jsonResponse<HistoryPage>(await getHistory(user.id, parsed.data));
});
