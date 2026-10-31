import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, parseSlug, route } from "@/lib/server/http";
import { getPuzzleDetail } from "@/lib/server/puzzles";

interface Context {
  params: Promise<{ slug: string }>;
}

export const GET = route("puzzles.detail", async (request, { params }: Context) => {
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Puzzle not found");
  const user = await getCurrentUser(request.headers);
  const puzzle = await getPuzzleDetail(user?.id ?? null, slug);
  return puzzle ? jsonResponse(puzzle) : errorResponse(404, "Puzzle not found");
});
