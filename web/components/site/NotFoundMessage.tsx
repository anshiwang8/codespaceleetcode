import Link from "next/link";
import { PUZZLES_PATH } from "@/lib/browse";

export function NotFoundMessage() {
  return (
    <main className="page-message">
      <h1>Not found</h1>
      <p className="muted">There&apos;s no such page or puzzle.</p>
      <p>
        <Link href={PUZZLES_PATH}>Back to the puzzle list</Link>
      </p>
    </main>
  );
}
