"use client";

import Link from "next/link";
import { PUZZLES_PATH } from "@/lib/browse";

// The profile's own error page, so a failure here keeps the header and says what to do.
export default function ProfileError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-message" role="alert" data-testid="profile-error">
      <h1>Your profile couldn&apos;t be loaded</h1>
      <p className="muted">
        Something went wrong on our side while loading your progress. Nothing has been lost. Try again in a moment.
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
