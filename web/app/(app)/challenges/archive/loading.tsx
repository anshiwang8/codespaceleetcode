import styles from "@/components/challenges/challenges.module.css";

export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading past challenges…
      </p>
      <div aria-hidden="true" className={styles.skeletons}>
        <div className={`skeleton ${styles.skeletonHeader}`} />
        <div className={styles.skeletonRows}>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="skeleton" />
          ))}
        </div>
      </div>
    </main>
  );
}
