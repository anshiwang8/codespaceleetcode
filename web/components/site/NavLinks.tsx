"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/site/site.module.css";
import { PUZZLES_PATH } from "@/lib/browse";

/** `wideOnly` links are left out on a phone, where something else on the page reaches them. */
const LINKS = [
  { href: PUZZLES_PATH, label: "Puzzles", wideOnly: false },
  { href: "/challenges", label: "Challenges", wideOnly: false },
  { href: "/leaderboard", label: "Leaderboard", wideOnly: false },
  { href: "/profile", label: "Profile", wideOnly: false },
  // The account link in the header goes to Settings too, and Profile links to it on a phone.
  { href: "/settings", label: "Settings", wideOnly: true },
] as const;

/**
 * The app's main navigation. The current page's link is marked `aria-current="page"`; on a page
 * inside a section, such as one puzzle, the section's link is marked `aria-current="true"`.
 */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Main">
      <ul>
        {LINKS.map(({ href, label, wideOnly }) => {
          const current = pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "true" : undefined;
          return (
            <li key={href} className={wideOnly ? styles.wideOnly : undefined}>
              <Link href={href} aria-current={current} data-testid={`nav-${label.toLowerCase()}`}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
