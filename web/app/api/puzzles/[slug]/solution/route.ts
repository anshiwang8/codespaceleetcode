import type { SolutionResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, parseSlug, route } from "@/lib/server/http";
import { getSolution } from "@/lib/server/puzzles";

interface Context {
  params: Promise<{ slug: string }>;
}

export const GET = route("puzzles.solution", async (request, { params }: Context) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see the solution");
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Puzzle not found");
  const solution = await getSolution(user.id, slug);
  switch (solution.state) {
    case "not_found":
      return errorResponse(404, "Puzzle not found");
    case "locked":
      return errorResponse(403, "Solve the puzzle or give up to see the solution");
    case "ok":
      return jsonResponse<SolutionResponse>({ bodyMd: solution.bodyMd });
  }
});
