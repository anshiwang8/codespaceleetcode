import type { Metadata } from "next";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { AccountSection } from "@/components/profile/AccountSection";
import { ActivityCalendar } from "@/components/profile/ActivityCalendar";
import { ContinuePracticing } from "@/components/profile/ContinuePracticing";
import { HistoryList } from "@/components/profile/HistoryList";
import { IdentityCard } from "@/components/profile/IdentityCard";
import { ProgressBreakdown } from "@/components/profile/ProgressBreakdown";
import { ProgressOverview } from "@/components/profile/ProgressOverview";
import styles from "@/components/profile/profile.module.css";
import type { Difficulty, PuzzleType } from "@/lib/api-types";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { getCurrentUser } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/profile";
import { topicLabel } from "@/lib/topics";

// Private to whoever is signed in. Reading the session cookie makes this page render per request,
// so one user's profile is never cached for another.
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

const TYPES: PuzzleType[] = ["find", "trace", "architecture"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

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
      </main>
    );
  }

  const { identity, progress, unfinished, activity, history } = profile;
  return (
    <main className={`page ${styles.page}`} data-testid="profile">
      <IdentityCard identity={identity} progress={progress} />

      {progress.total === 0 ? (
        <div className="empty" data-testid="profile-no-puzzles">
          <strong>No puzzles are available right now.</strong>
          <span>Your progress will show here once puzzles are published. Check back soon.</span>
        </div>
      ) : (
        <>
          <ProgressOverview progress={progress} />

          <ContinuePracticing
            unfinished={unfinished}
            hasSubmissions={history.entries.length > 0}
            allSolved={progress.solved === progress.total}
          />

          <section aria-labelledby="breakdown-heading" className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 id="breakdown-heading" className="section-title">
                Progress by category
              </h2>
              <p className={styles.legend}>
                <span className={styles.legendSolved} aria-hidden="true" /> Solved
                <span className={styles.legendAttempted} aria-hidden="true" /> In progress
              </p>
            </div>
            <div className={styles.breakdowns}>
              <ProgressBreakdown
                id="type"
                title="By type"
                rows={TYPES.map((type) => ({ key: type, label: TYPE_LABELS[type], ...progress.byType[type] }))}
              />
              <ProgressBreakdown
                id="difficulty"
                title="By difficulty"
                rows={DIFFICULTIES.map((difficulty) => ({
                  key: difficulty,
                  label: DIFFICULTY_LABELS[difficulty],
                  tone: `difficulty-${difficulty}`,
                  ...progress.byDifficulty[difficulty],
                }))}
              />
              <ProgressBreakdown
                id="repo"
                title="By repository"
                mono
                rows={progress.byRepo.map((repo) => ({
                  key: repo.repo,
                  label: repo.repo,
                  detail: repo.language,
                  solved: repo.solved,
                  attempted: repo.attempted,
                  total: repo.total,
                }))}
              />
              <ProgressBreakdown
                id="topic"
                title="By topic"
                note="A puzzle can have up to three topics, so it counts under each of them. These numbers overlap and don't add up to your total."
                rows={progress.byTopic.map((topic) => ({
                  key: topic.topic,
                  label: topicLabel(topic.topic),
                  solved: topic.solved,
                  attempted: topic.attempted,
                  total: topic.total,
                }))}
              />
            </div>
          </section>
        </>
      )}

      <div className={styles.activityRow}>
        <ActivityCalendar activity={activity} />
        <HistoryList initial={history} />
      </div>

      <AccountSection />
    </main>
  );
}
