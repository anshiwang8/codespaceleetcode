import type { Metadata } from "next";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { SettingsLink } from "@/components/profile/SettingsLink";
import { IdentityCard } from "@/components/profile/IdentityCard";
import { ProfileActivityArea } from "@/components/profile/ProfileActivityArea";
import styles from "@/components/profile/profile.module.css";
import { ThemeButton } from "@/components/themes/ThemeButton";
import { getCurrentUser } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/profile";

// Private to whoever is signed in. Reading the session cookie makes this page render per request,
// so one user's profile is never cached for another.
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  if (!profile) {
    return (
      <main className="page-message" data-testid="profile-signed-out">
        <h1>Your profile</h1>
        <p className="muted">
          Your profile shows what you&apos;ve solved, what&apos;s still in progress, and your recent activity.
        </p>
        <div className={styles.signedOutPrompt}>
          <SignInPrompt reason="Sign in to see your profile." />
        </div>
        <div className={styles.signedOutTheme}>
          <p className="muted">You can choose a theme without an account. It&apos;s remembered in this browser.</p>
          <ThemeButton />
        </div>
      </main>
    );
  }

  const { identity, progress, unfinished, activity, streaks, timeline, history } = profile;
  if (progress.total === 0) {
    return (
      <main className={`page ${styles.page}`} data-testid="profile">
        <IdentityCard identity={identity} progress={progress} />
        <div className="empty" data-testid="profile-no-puzzles">
          <strong>No puzzles are available right now.</strong>
          <span>Your progress will show here once puzzles are published. Check back soon.</span>
        </div>
        <SettingsLink />
      </main>
    );
  }

  return (
    <main className={`page ${styles.page}`} data-testid="profile">
      <IdentityCard identity={identity} progress={progress} />
      <ProfileActivityArea
        initialActivity={{ activity, timeline }}
        streaks={streaks}
        history={history}
        progress={progress}
        unfinished={unfinished}
      />
      <SettingsLink />
    </main>
  );
}
