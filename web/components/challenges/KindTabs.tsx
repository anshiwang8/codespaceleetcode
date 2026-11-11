import Link from "next/link";
import styles from "@/components/challenges/challenges.module.css";
import type { PeriodKind } from "@/lib/api-types";
import { PERIOD_KINDS, PERIOD_LABELS } from "@/lib/periods";

/** The archive's kind, as links: it lives in the URL and works before scripts load. */
export function KindTabs({ kind }: { kind: PeriodKind }) {
  return (
    <nav aria-label="Challenge kind" className={styles.kindTabs}>
      <ul className={styles.segmented}>
        {PERIOD_KINDS.map((option) => (
          <li key={option}>
            <Link
              href={`/challenges/archive?kind=${option}`}
              aria-current={option === kind ? "page" : undefined}
              data-testid={`archive-kind-${option}`}
            >
              {PERIOD_LABELS[option]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
