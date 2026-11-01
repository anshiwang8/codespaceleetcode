import styles from "@/components/puzzle/puzzle.module.css";

interface VisitedTrailProps {
  trail: string[];
  activePath: string | null;
  onOpen: (path: string) => void;
}

/** The breadcrumb trail: the files visited, in the order they were last visited. */
export function VisitedTrail({ trail, activePath, onOpen }: VisitedTrailProps) {
  return (
    <nav className={styles.trail} aria-label="Visited files" data-testid="visited-trail">
      {trail.length === 0 ? <span className="muted">Files you visit show up here.</span> : null}
      <ol>
        {trail.map((path) => (
          <li key={path}>
            <button
              type="button"
              title={path}
              aria-current={path === activePath ? "page" : undefined}
              onClick={() => onOpen(path)}
              data-testid="trail-item"
              data-path={path}
            >
              {path}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
