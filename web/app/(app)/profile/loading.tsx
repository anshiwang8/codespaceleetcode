import styles from "@/components/profile/profile.module.css";

export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading your profile…
      </p>
      <div aria-hidden="true" className={styles.skeletons}>
        <div className={`skeleton ${styles.skeletonIdentity}`} />
        <div className={styles.tiles}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`skeleton ${styles.skeletonTile}`} />
          ))}
        </div>
        <div className={`skeleton ${styles.skeletonBlock}`} />
      </div>
    </main>
  );
}
