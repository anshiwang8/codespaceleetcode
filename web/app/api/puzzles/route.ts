import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, queryParams, route, textValue } from "@/lib/server/http";
import { listPuzzles } from "@/lib/server/puzzles";

const filtersSchema = z.object({
  type: z.enum(["find", "trace", "architecture"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  repo: textValue(200).optional(),
  tag: textValue(200).optional(),
});

export const GET = route("puzzles.list", async (request) => {
  const filters = filtersSchema.safeParse(queryParams(request));
  if (!filters.success) return errorResponse(400, "Invalid filter");
  const user = await getCurrentUser(request.headers);
  return jsonResponse(await listPuzzles(user?.id ?? null, filters.data));
});
