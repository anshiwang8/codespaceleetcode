import Link from "next/link";
import { AuthControl } from "@/components/site/AuthControl";
import styles from "@/components/site/site.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          {"{?}"}
        </span>
        Codebase Puzzles
      </Link>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/">Puzzles</Link>
        <Link href="/profile">Profile</Link>
      </nav>
      <AuthControl />
    </header>
  );
}
