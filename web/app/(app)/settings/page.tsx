import type { Metadata } from "next";
import Link from "next/link";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { AccountSection } from "@/components/profile/AccountSection";
import { AvatarEditor } from "@/components/settings/AvatarEditor";
import { DetailsForm } from "@/components/settings/DetailsForm";
import { EmailPanel } from "@/components/settings/EmailPanel";
import { LinksForm } from "@/components/settings/LinksForm";
import styles from "@/components/settings/settings.module.css";
import { ThemePicker } from "@/components/themes/ThemePicker";
import { getCurrentUser } from "@/lib/server/auth";
import { getAvatar } from "@/lib/server/avatar";
import { getEmailStatus } from "@/lib/server/email";
import { getProfileRecord } from "@/lib/server/settings";

// Private to whoever is signed in, and rendered per request from their session.
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "profile", label: "Profile" },
  { id: "links", label: "Links" },
  { id: "email", label: "Email and account" },
] as const;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="page-message" data-testid="settings-signed-out">
        <h1>Settings</h1>
        <p className="muted">Sign in to change your theme, picture, profile, links and email.</p>
        <div className={styles.signedOut}>
          <SignInPrompt reason="Sign in to see your settings." />
        </div>
        <p className={styles.hint}>
          You can still pick a theme for this browser with the Theme button at the top of the page.
        </p>
      </main>
    );
  }
  const [record, avatar, email] = await Promise.all([getProfileRecord(user.id), getAvatar(user.id), getEmailStatus(user)]);

  return (
    <main className={`page ${styles.page}`} data-testid="settings">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-lede">
            Signed in as <span className="mono">{user.login}</span> with {user.via === "github" ? "GitHub" : "the local dev login"}.
            Your progress is on your <Link href="/profile">profile</Link>.
          </p>
        </div>
      </div>
      <nav className={styles.toc} aria-label="Settings sections">
        <ul>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="appearance" className={`card ${styles.section}`} aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="section-title">
          Appearance
        </h2>
        <p className={styles.lede}>
          189 themes, light and dark. Choosing one previews it here; Apply saves it to your account, so it follows
          you to any browser you sign in on.
        </p>
        <ThemePicker variant="page" />
      </section>

      <section id="profile" className={`card ${styles.section}`} aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="section-title">
          Profile
        </h2>
        <p className={styles.lede}>Everything here is optional, and only you can see it.</p>
        <AvatarEditor initialVersion={avatar?.version ?? null} />
        <DetailsForm initial={record.details} />
      </section>

      <section id="links" className={`card ${styles.section}`} aria-labelledby="links-heading">
        <h2 id="links-heading" className="section-title">
          Links
        </h2>
        <LinksForm initial={record.links} />
      </section>

      <section id="email" className={`card ${styles.section}`} aria-labelledby="email-heading">
        <h2 id="email-heading" className="section-title">
          Email and account
        </h2>
        <h3 className={styles.subheading}>Email</h3>
        <EmailPanel initial={email} provider={user.via} />
      </section>
      <AccountSection />
    </main>
  );
}
