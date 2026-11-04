export default function Loading() {
  return (
    <main className="page-message" aria-busy="true">
      <p className="muted" role="status">
        Loading puzzle…
      </p>
    </main>
  );
}
