import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { AccountSection } from "@/components/profile/AccountSection";
import { AvatarEditor } from "@/components/settings/AvatarEditor";
import { DangerZone } from "@/components/settings/DangerZone";
import { DetailsForm } from "@/components/settings/DetailsForm";
import { EmailPanel } from "@/components/settings/EmailPanel";
import { LeaderboardVisibility } from "@/components/settings/LeaderboardVisibility";
import { LinksForm } from "@/components/settings/LinksForm";
import { SectionBoundary } from "@/components/settings/SectionBoundary";
import { SectionSkeleton, SettingsSection, SettingsToc, type SkeletonSize } from "@/components/settings/SettingsShell";
import styles from "@/components/settings/settings.module.css";
import { ThemePicker } from "@/components/themes/ThemePicker";
import { getCurrentUser, type CurrentUser } from "@/lib/server/auth";
import { getSettingsData, type SettingsData } from "@/lib/server/settings";

// Private to whoever is signed in, and rendered per request from their session.
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

/**
 * /settings streams. The session is checked first, so nothing private renders for anyone else;
 * then the header, section list, Appearance, Account and Danger zone go out at once, since they
 * need no data, and the sections that do fill in as the one settings query (getSettingsData)
 * answers. Each of those sections has its own placeholder and its own error boundary.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="page-message" data-testid="settings-signed-out">
        <h1>Settings</h1>
        <p className="muted">
          Sign in to change your theme, picture, profile, links, email and whether you appear on the leaderboard.
        </p>
        <div className={styles.signedOut}>
          <SignInPrompt reason="Sign in to see your settings." />
        </div>
        <p className={styles.hint}>
          You can still pick a theme for this browser from the Theme button on the profile page.
        </p>
      </main>
    );
  }
  // Started once and shared, so the sections wait on one query together, never one after another.
  const data = getSettingsData(user);
  // Each section awaits it; this only stops a failure being reported as unhandled before they do.
  data.catch(() => undefined);

  return (
    <main className={`page ${styles.page}`} data-testid="settings">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-lede">
            Signed in as <strong>{user.login}</strong> with {user.via === "github" ? "GitHub" : "the local dev login"}.
            Your progress is on your <Link href="/profile">profile</Link>.
          </p>
        </div>
      </div>
      <SettingsToc />

      <SettingsSection id="appearance">
        <ThemePicker variant="page" />
      </SettingsSection>

      <SettingsSection id="profile">
        <Streamed size="profile" what="Your profile">
          <ProfileContent data={data} />
        </Streamed>
      </SettingsSection>

      <SettingsSection id="links">
        <Streamed size="links" what="Your links">
          <LinksContent data={data} />
        </Streamed>
      </SettingsSection>

      <SettingsSection id="leaderboard">
        <Streamed size="leaderboard" what="Your leaderboard setting">
          <LeaderboardContent data={data} />
        </Streamed>
      </SettingsSection>

      <SettingsSection id="email">
        <h3 className={styles.subheading}>Email</h3>
        <Streamed size="email" what="Your email settings">
          <EmailContent data={data} user={user} />
        </Streamed>
      </SettingsSection>
      <AccountSection />
      <DangerZone provider={user.via} />
    </main>
  );
}

function Streamed({ size, what, children }: { size: SkeletonSize; what: string; children: React.ReactNode }) {
  return (
    <SectionBoundary what={what}>
      <Suspense fallback={<SectionSkeleton size={size} />}>{children}</Suspense>
    </SectionBoundary>
  );
}

type DataProps = { data: Promise<SettingsData> };

async function ProfileContent({ data }: DataProps) {
  const { avatarVersion, details } = await data;
  return (
    <>
      <AvatarEditor initialVersion={avatarVersion} />
      <DetailsForm initial={details} />
    </>
  );
}

async function LinksContent({ data }: DataProps) {
  return <LinksForm initial={(await data).links} />;
}

async function LeaderboardContent({ data }: DataProps) {
  return <LeaderboardVisibility initial={(await data).participation} />;
}

async function EmailContent({ data, user }: DataProps & { user: CurrentUser }) {
  return <EmailPanel initial={(await data).email} provider={user.via} />;
}
