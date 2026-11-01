"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-message" role="alert">
      <h1>Couldn&apos;t load this page</h1>
      <p className="muted">
        The server hit an error, most likely reaching the database. If you&apos;re running this
        locally, check that it&apos;s up with <code>pnpm db</code>.
      </p>
      <button type="button" className="btn" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
