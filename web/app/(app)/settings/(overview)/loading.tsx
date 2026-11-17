import { SectionSkeleton, SettingsSection, SettingsToc } from "@/components/settings/SettingsShell";
import styles from "@/components/settings/settings.module.css";

// Shown the moment someone opens /settings, while their session is checked. It has the page's
// own layout, so nothing jumps when the page replaces it. It sits in the (overview) group so the
// email pages under /settings/email don't borrow it.
export default function Loading() {
  return (
    <main className={`page ${styles.page}`} aria-busy="true" data-testid="settings-loading">
      <p className="visually-hidden" role="status">
        Loading your settings…
      </p>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div aria-hidden="true" className={`skeleton ${styles.skeletonLede}`} />
        </div>
      </div>
      <SettingsToc />
      <SettingsSection id="appearance">
        <SectionSkeleton size="appearance" announce={false} />
      </SettingsSection>
      <SettingsSection id="profile">
        <SectionSkeleton size="profile" announce={false} />
      </SettingsSection>
      <SettingsSection id="links">
        <SectionSkeleton size="links" announce={false} />
      </SettingsSection>
      <SettingsSection id="leaderboard">
        <SectionSkeleton size="leaderboard" announce={false} />
      </SettingsSection>
      <SettingsSection id="email">
        <h3 className={styles.subheading}>Email</h3>
        <SectionSkeleton size="email" announce={false} />
      </SettingsSection>
    </main>
  );
}
