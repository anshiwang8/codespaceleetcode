import styles from "@/components/list/list.module.css";

export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading puzzles…
      </p>
      <div aria-hidden="true">
        <div className={`skeleton ${styles.skeletonHeader}`} />
        <div className={`skeleton ${styles.skeletonPanel}`} />
        <div className={styles.skeletonRows}>
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="skeleton" />
          ))}
        </div>
      </div>
    </main>
  );
}
