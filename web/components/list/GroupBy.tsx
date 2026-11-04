import Link from "next/link";
import styles from "@/components/list/list.module.css";
import { browseHref, GROUPING_LABELS, GROUPINGS, type BrowseState } from "@/lib/browse";

/** Links rather than buttons, so the grouping lives in the URL and works before scripts load. */
export function GroupBy({ state }: { state: BrowseState }) {
  return (
    <nav aria-labelledby="group-by-label" className={styles.groupBy}>
      <span id="group-by-label" className={styles.groupByLabel}>
        Group by
      </span>
      <ul className={styles.segmented}>
        {GROUPINGS.map((grouping) => (
          <li key={grouping}>
            <Link
              href={browseHref({ ...state, group: grouping })}
              aria-current={state.group === grouping ? "true" : undefined}
              data-testid={`group-by-${grouping}`}
            >
              {GROUPING_LABELS[grouping]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
