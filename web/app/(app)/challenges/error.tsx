"use client";

import Link from "next/link";
import { PUZZLES_PATH } from "@/lib/browse";

// The challenges' own error page, so a failure here keeps the header and says what to do.
export default function ChallengesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-message" role="alert" data-testid="challenges-error">
      <h1>Challenges couldn&apos;t be loaded</h1>
      <p className="muted">
        Something went wrong on our side while loading the challenges. Your progress is safe. Try again in a moment,
        or keep practicing from the puzzle list.
      </p>
      <p className="actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href={PUZZLES_PATH} className="btn">
          Go to puzzles
        </Link>
      </p>
    </main>
  );
}
