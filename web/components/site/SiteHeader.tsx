import Link from "next/link";
import { AuthControl } from "@/components/site/AuthControl";
import { Logo } from "@/components/site/Logo";
import styles from "@/components/site/site.module.css";
import { PUZZLES_PATH } from "@/lib/browse";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <Logo size="small" />
      </Link>
      <nav className={styles.nav} aria-label="Main">
        <Link href={PUZZLES_PATH}>Puzzles</Link>
        <Link href="/profile">Profile</Link>
      </nav>
      <AuthControl />
    </header>
  );
}
