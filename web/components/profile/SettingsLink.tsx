import Link from "next/link";
import styles from "@/components/profile/profile.module.css";

/**
 * The way to Settings on a phone, where the header leaves its link out. Settings has the theme,
 * profile details, links, email and account.
 */
export function SettingsLink() {
  return (
    <section className={`card ${styles.settingsLink}`} aria-labelledby="settings-link-heading" data-testid="settings-link">
      <div>
        <h2 id="settings-link-heading" className="section-title">
          Settings
        </h2>
        <p className={styles.cardNote}>Theme, picture, profile details, links, email, sign out and account deletion.</p>
      </div>
      <Link href="/settings" className="btn">
        Open settings
      </Link>
    </section>
  );
}
