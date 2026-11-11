import type { Metadata } from "next";
import { TooManyRequests } from "@/components/site/TooManyRequests";
import Link from "next/link";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { ChallengeCardView } from "@/components/challenges/ChallengeCardView";
import styles from "@/components/challenges/challenges.module.css";
import { ChallengeStreakPanel } from "@/components/challenges/ChallengeStreakPanel";
import { HowChallengesWork } from "@/components/challenges/HowChallengesWork";
import { PUZZLES_PATH } from "@/lib/browse";
import { getCurrentUser } from "@/lib/server/auth";
import { isPageRateLimited } from "@/lib/server/rate-limit";
import { getChallenges } from "@/lib/server/challenges";

// Public, and read-only when signed out. Reading the session makes it render per request, so
// one user's completions are never cached for another, and the countdown starts from now.
export const metadata: Metadata = {
  title: "Challenges",
  description: "A daily, weekly and monthly code-reading puzzle, the same for everyone.",
};

export default async function ChallengesPage() {
  const user = await getCurrentUser();
  if (await isPageRateLimited(user)) return <TooManyRequests />;
  const challenges = await getChallenges(user?.id ?? null);
  const signedIn = user !== null;

  return (
    <main className={`page ${styles.page}`} data-testid="challenges">
      <div className="page-header">
        <div>
          <h1 className="page-title">Challenges</h1>
          <p className="page-lede">
            A daily, weekly and monthly puzzle, the same for everyone. Solve one while it&apos;s open for bonus
            points.
          </p>
        </div>
        <Link href="/challenges/archive" className="btn" data-testid="challenges-archive-link">
          Past challenges
        </Link>
      </div>

      {challenges.current.length === 0 ? (
        <div className="empty" data-testid="challenges-empty">
          <strong>There are no challenges right now.</strong>
          <span>Challenges are picked from the published puzzles, and none are available yet. Check back soon.</span>
          <Link href={PUZZLES_PATH} className="btn btn-small">
            Browse puzzles
          </Link>
        </div>
      ) : (
        <div className={styles.cards}>
          {challenges.current.map((card) => (
            <ChallengeCardView key={card.kind} card={card} now={challenges.now} signedIn={signedIn} />
          ))}
        </div>
      )}

      <div className={styles.lower}>
        {challenges.streak && challenges.completedCounts ? (
          <ChallengeStreakPanel streak={challenges.streak} completedCounts={challenges.completedCounts} />
        ) : (
          <section className={styles.signedOut} aria-label="Track your challenges" data-testid="challenges-signed-out">
            <SignInPrompt reason="Anyone can read the challenges. Sign in to complete them, earn the bonus points and keep a daily streak." />
          </section>
        )}
        <HowChallengesWork />
      </div>
    </main>
  );
}
