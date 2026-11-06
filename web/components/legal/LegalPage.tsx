import Link from "next/link";
import styles from "@/components/legal/legal.module.css";
import { Logo } from "@/components/site/Logo";
import { LEGAL, type LegalPageKey } from "@/lib/legal";

/** The frame both legal pages share: the logo home, the title, the date, and the draft notice. */
export function LegalPage({ page, title, children }: { page: LegalPageKey; title: string; children: React.ReactNode }) {
  const { reviewed, lastUpdated } = LEGAL.PAGES[page];
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.home} aria-label="codebases home">
        <Logo size="medium" />
      </Link>
      <h1>{title}</h1>
      <p className={styles.updated}>Last updated {lastUpdated}</p>
      {reviewed ? null : (
        <p className={`notice ${styles.draft}`} role="note" data-testid="legal-draft">
          Draft: this page hasn&apos;t been reviewed yet and may change before launch.
        </p>
      )}
      {children}
      <p className={styles.footer}>
        <Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms</Link> ·{" "}
        <Link href="/puzzles">Puzzles</Link>
      </p>
    </main>
  );
}

/** How to reach whoever runs the site, or a note that it's coming. */
export function ContactLine() {
  return LEGAL.CONTACT ? (
    <a href={`mailto:${LEGAL.CONTACT}`}>{LEGAL.CONTACT}</a>
  ) : (
    <span data-testid="legal-contact-missing">the contact address that will be listed here before launch</span>
  );
}
