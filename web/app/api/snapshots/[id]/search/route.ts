import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { searchSnapshot } from "@/lib/server/code-index";
import {
  errorResponse,
  jsonResponse,
  parseSnapshotId,
  queryParams,
  route,
  textValue,
} from "@/lib/server/http";
import { isRateLimited, rateLimitKey, SEARCH_LIMIT } from "@/lib/server/rate-limit";

interface Context {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({ q: textValue(200).refine((q) => q.length >= 2) });

export const GET = route("snapshots.search", async (request, { params }: Context) => {
  const user = await getCurrentUser(request.headers);
  if (isRateLimited(`search:${rateLimitKey(user, request.headers)}`, SEARCH_LIMIT)) {
    return errorResponse(429, "Too many searches. Try again in a minute.");
  }
  const snapshotId = parseSnapshotId((await params).id);
  if (snapshotId === null) return errorResponse(404, "Snapshot not found");
  const query = querySchema.safeParse(queryParams(request));
  if (!query.success) return errorResponse(400, "q must be 2 to 200 characters");
  const results = await searchSnapshot(snapshotId, query.data.q);
  return results ? jsonResponse(results) : errorResponse(404, "Snapshot not found");
});
