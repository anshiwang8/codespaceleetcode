import { createHash } from "node:crypto";
import { errorResponse, route } from "@/lib/server/http";
import { readSnapshotFile } from "@/lib/server/snapshot-files";

interface Context {
  params: Promise<{ name: string; path: string[] }>;
}

export const GET = route("snapshots.file", async (request, { params }: Context) => {
  const { name, path } = await params;
  const file = await readSnapshotFile(name, path);
  if (!file) return errorResponse(404, "Not found");
  // A snapshot's SHA never changes, but rebuilding it with an improved pipeline keeps its name and
  // can change its manifest and files. So caches must revalidate, and the ETag makes that cheap.
  const etag = `"${createHash("sha256").update(file.body).digest("hex")}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "public, no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(file.body, { headers: { ...headers, "Content-Type": file.contentType } });
});
