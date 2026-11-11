import styles from "@/components/challenges/challenges.module.css";

export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading challenges…
      </p>
      <div aria-hidden="true" className={styles.skeletons}>
        <div className={`skeleton ${styles.skeletonHeader}`} />
        <div className={styles.cards}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={`skeleton ${styles.skeletonCard}`} />
          ))}
        </div>
      </div>
    </main>
  );
}
