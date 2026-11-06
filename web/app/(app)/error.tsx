"use client";

import Link from "next/link";
import { PUZZLES_PATH } from "@/lib/browse";

// Shown to everyone, so it says what happened and what to do, not how to debug the server. The
// error itself is logged on the server.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-message" role="alert">
      <h1>Something went wrong</h1>
      <p className="muted">
        This page couldn&apos;t be loaded. It&apos;s probably a temporary problem on our side. Try again in a
        moment.
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
