import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { searchSnapshot } from "@/lib/server/code-index";
import {
  errorResponse,
  publicJsonResponse,
  parseSnapshotId,
  queryParams,
  route,
  SNAPSHOT_INDEX_CACHE,
  textValue,
} from "@/lib/server/http";
import {
  isRateLimited,
  rateLimitKey,
  SEARCH_LIMIT,
  SHORT_SEARCH_CHARS,
  SHORT_SEARCH_LIMIT,
} from "@/lib/server/rate-limit";

interface Context {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({ q: textValue(200).refine((q) => q.length >= 2) });

const TOO_MANY = "Too many searches. Try again in a minute.";

export const GET = route("snapshots.search", async (request, { params }: Context) => {
  const user = await getCurrentUser(request.headers);
  const client = rateLimitKey(user, request.headers);
  if (await isRateLimited(`search:${client}`, SEARCH_LIMIT)) return errorResponse(429, TOO_MANY);
  const snapshotId = parseSnapshotId((await params).id);
  if (snapshotId === null) return errorResponse(404, "Snapshot not found");
  const query = querySchema.safeParse(queryParams(request));
  if (!query.success) return errorResponse(400, "q must be 2 to 200 characters");
  if (query.data.q.length < SHORT_SEARCH_CHARS && (await isRateLimited(`search-short:${client}`, SHORT_SEARCH_LIMIT))) {
    return errorResponse(429, TOO_MANY);
  }
  const results = await searchSnapshot(snapshotId, query.data.q);
  return results ? publicJsonResponse(request, results, SNAPSHOT_INDEX_CACHE) : errorResponse(404, "Snapshot not found");
});
