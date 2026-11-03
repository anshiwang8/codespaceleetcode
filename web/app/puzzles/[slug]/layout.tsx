import { notFound } from "next/navigation";
import { loadPuzzlePage } from "@/lib/server/puzzle-page";

// loading.tsx wraps the page, not this layout, so a missing puzzle is found here before anything
// streams, and the response can still be a 404.
export default async function PuzzleLayout({ children, params }: LayoutProps<"/puzzles/[slug]">) {
  if (!(await loadPuzzlePage((await params).slug))) notFound();
  return children;
}
