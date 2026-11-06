import styles from "@/components/profile/profile.module.css";

export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading your profile…
      </p>
      <div aria-hidden="true" className={styles.skeletons}>
        <div className={`skeleton ${styles.skeletonIdentity}`} />
        <div className={`skeleton ${styles.skeletonTracker}`} />
        <div className={`skeleton ${styles.skeletonBlock}`} />
      </div>
    </main>
  );
}
