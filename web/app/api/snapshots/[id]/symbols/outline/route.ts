import { z } from "zod";
import { fileOutline } from "@/lib/server/code-index";
import {
  errorResponse,
  publicJsonResponse,
  parseSnapshotId,
  queryParams,
  route,
  SNAPSHOT_INDEX_CACHE,
  textValue,
} from "@/lib/server/http";

interface Context {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({ file: textValue(2048) });

export const GET = route("snapshots.outline", async (request, { params }: Context) => {
  const snapshotId = parseSnapshotId((await params).id);
  if (snapshotId === null) return errorResponse(404, "Snapshot not found");
  const query = querySchema.safeParse(queryParams(request));
  if (!query.success) return errorResponse(400, "file is required");
  const outline = await fileOutline(snapshotId, query.data.file);
  return outline ? publicJsonResponse(request, outline, SNAPSHOT_INDEX_CACHE) : errorResponse(404, "File not found");
});
