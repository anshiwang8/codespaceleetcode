"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/site/site.module.css";
import { PUZZLES_PATH } from "@/lib/browse";

// Profile and Settings live in the account menu, under the signed-in user's name (AccountMenu.tsx).
const LINKS = [
  { href: PUZZLES_PATH, label: "Puzzles" },
  { href: "/challenges", label: "Challenges" },
  { href: "/leaderboard", label: "Leaderboard" },
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
        {LINKS.map(({ href, label }) => {
          const current = pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "true" : undefined;
          return (
            <li key={href}>
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
