import type { Metadata } from "next";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { StatsTable } from "@/components/profile/StatsTable";
import styles from "@/components/profile/profile.module.css";
import { getCurrentUser } from "@/lib/server/auth";
import { getStats } from "@/lib/server/puzzles";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="page-message" data-testid="profile-signed-out">
        <h1>Profile</h1>
        <SignInPrompt reason="Sign in to see your solved counts." />
      </main>
    );
  }
  const stats = await getStats(user.id);
  return (
    <main className={styles.page}>
      <h1 className={styles.login}>{user.login}</h1>
      <p className={styles.total} data-testid="stats-total">
        <strong>{stats.solved}</strong> of {stats.total} puzzles solved
      </p>
      {stats.total === 0 ? (
        <p className="notice">
          No puzzles are published yet. From <code>ingest/</code>, run{" "}
          <code>uv run ingest seed</code>.
        </p>
      ) : (
        <div className={styles.tables}>
          <StatsTable title="By type" group="type" rows={stats.byType} />
          <StatsTable title="By difficulty" group="difficulty" rows={stats.byDifficulty} />
        </div>
      )}
    </main>
  );
}
