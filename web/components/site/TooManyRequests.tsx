/** What a rate-limited page shows instead of its content. */
export function TooManyRequests() {
  return (
    <main className="page-message" role="alert" data-testid="too-many-requests">
      <h1>Too many requests</h1>
      <p className="muted">
        This page was loaded many times in the last minute. Wait a minute, then
        reload it.
      </p>
    </main>
  );
}
