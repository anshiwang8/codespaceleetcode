import styles from "@/components/list/list.module.css";

export default function Loading() {
  return (
    <main className={styles.page} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading
      </p>
      <div className={styles.skeletonRows} aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="skeleton" />
        ))}
      </div>
    </main>
  );
}
