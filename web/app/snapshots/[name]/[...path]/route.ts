import { errorResponse, route } from "@/lib/server/http";
import { readSnapshotFile } from "@/lib/server/snapshot-files";

interface Context {
  params: Promise<{ name: string; path: string[] }>;
}

export const GET = route("snapshots.file", async (_request, { params }: Context) => {
  const { name, path } = await params;
  const file = await readSnapshotFile(name, path);
  if (!file) return errorResponse(404, "Not found");
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
      // A snapshot's name contains its SHA, and snapshots never change.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
