import "server-only";
import { cache } from "react";
import type { PuzzleDetail } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { parseSlug } from "@/lib/server/http";
import { getPuzzleDetail } from "@/lib/server/puzzles";

/**
 * The puzzle page's data, loaded once per request and shared by its layout, metadata and page.
 * PuzzleDetail has no answer key in it, so it's safe to hand to a client component as props.
 */
export const loadPuzzlePage = cache(async (rawSlug: string): Promise<PuzzleDetail | null> => {
  const slug = parseSlug(rawSlug);
  if (!slug) return null;
  const user = await getCurrentUser();
  return getPuzzleDetail(user?.id ?? null, slug);
});
