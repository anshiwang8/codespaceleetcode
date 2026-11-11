import Link from "next/link";
import { Logo } from "@/components/site/Logo";
import styles from "@/components/site/footer.module.css";
import { PUZZLES_PATH } from "@/lib/browse";

const LINKS = [
  { href: PUZZLES_PATH, label: "Puzzles" },
  { href: "/challenges", label: "Challenges" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * The site's footer: the logo, a line on where the code comes from, and the main and legal links.
 * The landing page and every app page but the puzzle workspace (components/site/ShellBody.tsx)
 * end with it.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Logo size="small" />
          <p className={styles.note}>Puzzles are set in open-source repositories, each under its own license.</p>
        </div>
        <nav aria-label="Footer" className={styles.nav}>
          <ul>
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
