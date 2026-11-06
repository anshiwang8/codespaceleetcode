export default function Loading() {
  return (
    <main className="page-message" aria-busy="true">
      <p className="muted" role="status">
        Loading the puzzle…
      </p>
    </main>
  );
}
