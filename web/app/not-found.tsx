import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-message">
      <h1>Not found</h1>
      <p className="muted">There&apos;s no such page or puzzle.</p>
      <p>
        <Link href="/">Back to the puzzle list</Link>
      </p>
    </main>
  );
}
