"use client";

import { usePathname } from "next/navigation";
import styles from "@/components/site/site.module.css";

/** A puzzle's page, `/puzzles/<slug>`: the full-height workspace. */
const WORKSPACE = /^\/puzzles\/[^/]+\/?$/;

/**
 * Everything under the header, and the footer. The puzzle workspace fills exactly the height left
 * under the header and scrolls inside its own panes, so it gets no footer and its container may
 * shrink to fit. Every other page grows with its content and ends with the footer.
 */
export function ShellBody({ footer, children }: { footer: React.ReactNode; children: React.ReactNode }) {
  const workspace = WORKSPACE.test(usePathname());
  return (
    <>
      {/* The skip link's target. tabIndex lets it take focus without being in the tab order. */}
      <div id="main" tabIndex={-1} className={workspace ? styles.content : `${styles.content} ${styles.page}`}>
        {children}
      </div>
      {workspace ? null : footer}
    </>
  );
}
