import { z } from "zod";
import { symbolAtPosition } from "@/lib/server/code-index";
import {
  errorResponse,
  jsonResponse,
  parseSnapshotId,
  positiveIntParam,
  queryParams,
  route,
  textValue,
} from "@/lib/server/http";

interface Context {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({
  file: textValue(2048),
  line: positiveIntParam,
  col: positiveIntParam,
});

export const GET = route("snapshots.symbols", async (request, { params }: Context) => {
  const snapshotId = parseSnapshotId((await params).id);
  if (snapshotId === null) return errorResponse(404, "Snapshot not found");
  const query = querySchema.safeParse(queryParams(request));
  if (!query.success) return errorResponse(400, "file, line and col are required");
  const { file, line, col } = query.data;
  const result = await symbolAtPosition(snapshotId, file, line, col);
  return result ? jsonResponse(result) : errorResponse(404, "File not found");
});
