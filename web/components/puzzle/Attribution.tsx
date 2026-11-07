import styles from "@/components/puzzle/puzzle.module.css";
import type { SnapshotInfo } from "@/lib/api-types";
import { githubTreeUrl } from "@/lib/client/snapshot-urls";

/** Spec section 5: every puzzle page credits the repo, pinned to its commit. */
export function Attribution({ snapshot }: { snapshot: SnapshotInfo }) {
  return (
    <footer className={styles.attribution} data-testid="attribution">
      <span>
        Code from {snapshot.repoSlug}
      </span>
      <span className="mono" title={snapshot.sha} data-testid="attribution-sha">
        {snapshot.sha.slice(0, 12)}
      </span>
      <span>License: {snapshot.license}</span>
      <a
        href={githubTreeUrl(snapshot.repoUrl, snapshot.sha)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="attribution-link"
      >
        View on GitHub at this commit
      </a>
    </footer>
  );
}
