import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PuzzleWorkspace } from "@/components/puzzle/PuzzleWorkspace";
import { getCurrentUser } from "@/lib/server/auth";
import { parseSlug } from "@/lib/server/http";
import { getPuzzleDetail } from "@/lib/server/puzzles";

// PuzzleDetail has no answer key in it, so it's safe to hand to a client component as props.
const loadPuzzle = cache(async (rawSlug: string) => {
  const slug = parseSlug(rawSlug);
  if (!slug) return null;
  const user = await getCurrentUser();
  return getPuzzleDetail(user?.id ?? null, slug);
});

export async function generateMetadata({ params }: PageProps<"/puzzles/[slug]">): Promise<Metadata> {
  const puzzle = await loadPuzzle((await params).slug);
  return { title: puzzle?.title ?? "Not found" };
}

export default async function PuzzlePage({ params }: PageProps<"/puzzles/[slug]">) {
  const puzzle = await loadPuzzle((await params).slug);
  if (!puzzle) notFound();
  return <PuzzleWorkspace key={puzzle.slug} puzzle={puzzle} />;
}
