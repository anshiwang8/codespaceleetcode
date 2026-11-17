import type { Metadata } from "next";
import { TooManyRequests } from "@/components/site/TooManyRequests";
import Link from "next/link";
import { ChallengeBar } from "@/components/challenges/ChallengeBar";
import styles from "@/components/challenges/challenges.module.css";
import { ChallengeSignIn } from "@/components/challenges/ChallengeSignIn";
import { ChallengeStreakPanel } from "@/components/challenges/ChallengeStreakPanel";
import { HowChallengesWork } from "@/components/challenges/HowChallengesWork";
import { Mascot } from "@/components/site/Mascot";
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

      {/* Two columns of one height: the three bars, and the streak. */}
      <div className={styles.board}>
        {challenges.current.length === 0 ? (
          <div className={`empty ${styles.boardEmpty}`} data-testid="challenges-empty">
            <strong>There are no challenges right now.</strong>
            <span>Challenges are picked from the published puzzles, and none are available yet. Check back soon.</span>
            <Link href={PUZZLES_PATH} className="btn btn-small">
              Browse puzzles
            </Link>
          </div>
        ) : (
          <div className={styles.bars} data-testid="challenge-bars">
            {challenges.current.map((card) => (
              <ChallengeBar key={card.kind} card={card} now={challenges.now} signedIn={signedIn} />
            ))}
          </div>
        )}

        {challenges.streak && challenges.completedCounts ? (
          <ChallengeStreakPanel streak={challenges.streak} completedCounts={challenges.completedCounts} now={challenges.now} />
        ) : (
          <section
            className={`card ${styles.panel} ${styles.signedOut}`}
            aria-labelledby="challenge-signed-out-heading"
            data-testid="challenges-signed-out"
          >
            {/* Decorative: the sentence beside it says everything. Its square is reserved in the stylesheet. */}
            <div className={styles.mascotBox} aria-hidden="true" data-testid="challenge-mascot">
              <Mascot form="full" className={styles.mascot} />
            </div>
            <div className={styles.signedOutBody}>
              <h2 id="challenge-signed-out-heading" className="section-title">
                Daily streak
              </h2>
              <p className={styles.signedOutText}>
                Sign in to complete challenges, earn their bonus points and keep a daily streak.
              </p>
              <ChallengeSignIn />
            </div>
          </section>
        )}
      </div>

      <HowChallengesWork rotations={challenges.current.map(({ kind, endsAt }) => ({ kind, endsAt }))} />
    </main>
  );
}
