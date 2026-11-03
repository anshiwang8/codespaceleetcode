import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PuzzleWorkspace } from "@/components/puzzle/PuzzleWorkspace";
import { loadPuzzlePage } from "@/lib/server/puzzle-page";

export async function generateMetadata({ params }: PageProps<"/puzzles/[slug]">): Promise<Metadata> {
  const puzzle = await loadPuzzlePage((await params).slug);
  return { title: puzzle?.title ?? "Not found" };
}

export default async function PuzzlePage({ params }: PageProps<"/puzzles/[slug]">) {
  const puzzle = await loadPuzzlePage((await params).slug);
  if (!puzzle) notFound();
  return <PuzzleWorkspace key={puzzle.slug} puzzle={puzzle} />;
}
