import type { GiveUpResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, parseSlug, route } from "@/lib/server/http";
import { giveUp } from "@/lib/server/puzzles";

interface Context {
  params: Promise<{ slug: string }>;
}

export const POST = route("puzzles.giveUp", async (request, { params }: Context) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to give up");
  const slug = parseSlug((await params).slug);
  if (!slug) return errorResponse(404, "Puzzle not found");
  const status = await giveUp(user.id, slug);
  return status ? jsonResponse<GiveUpResponse>({ status }) : errorResponse(404, "Puzzle not found");
});
