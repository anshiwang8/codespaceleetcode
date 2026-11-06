import Link from "next/link";
import { PUZZLES_PATH } from "@/lib/browse";

export function NotFoundMessage() {
  return (
    <main className="page-message">
      <h1>Page not found</h1>
      <p className="muted">There&apos;s no page or puzzle at this address. It may have moved, or the link may be mistyped.</p>
      <p className="actions">
        <Link href={PUZZLES_PATH} className="btn btn-primary">
          Browse puzzles
        </Link>
        <Link href="/" className="btn">
          Home
        </Link>
      </p>
    </main>
  );
}
