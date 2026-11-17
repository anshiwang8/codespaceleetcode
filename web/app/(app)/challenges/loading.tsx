import styles from "@/components/challenges/challenges.module.css";

// The same grid as the page: a header, three bars beside the streak panel, and the closed
// disclosure, each at the height its content will have, so nothing moves when the data arrives.
export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading challenges…
      </p>
      <div aria-hidden="true" className={styles.skeletons}>
        <div className={styles.skeletonHead}>
          <div className={`skeleton ${styles.skeletonLede}`} />
          <div className={`skeleton ${styles.skeletonButton}`} />
        </div>
        <div className={styles.board}>
          <div className={styles.bars}>
            {[0, 1, 2].map((index) => (
              <div key={index} className={`skeleton ${styles.skeletonBar}`} />
            ))}
          </div>
          <div className={`skeleton ${styles.panel} ${styles.skeletonPanel}`} />
        </div>
        <div className={`skeleton ${styles.skeletonRules}`} />
      </div>
    </main>
  );
}
