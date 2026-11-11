import styles from "@/components/challenges/challenges.module.css";
import { formatNumber } from "@/lib/format";
import { SCORING } from "@/lib/scoring";

/** The rules in four lines, the same for everyone. */
export function HowChallengesWork() {
  const { daily, weekly, monthly } = SCORING.challengeBonus;
  return (
    <section className={styles.rules} aria-labelledby="challenge-rules-heading" data-testid="challenge-rules">
      <h2 id="challenge-rules-heading" className="section-title">
        How challenges work
      </h2>
      <ul>
        <li>
          Everyone gets the same puzzles. A daily challenge is open for one UTC day, a weekly one from Monday to Sunday,
          and a monthly one for the calendar month.
        </li>
        <li>
          Solve a challenge&apos;s puzzle while it&apos;s open to complete it and earn its bonus: +{formatNumber(daily)}{" "}
          points for daily, +{formatNumber(weekly)} for weekly and +{formatNumber(monthly)} for monthly, once each.
        </li>
        <li>A correct answer counts even if you solved the puzzle before the challenge began.</li>
        <li>After a challenge ends, its puzzle stays open to practice, but it no longer earns the bonus.</li>
      </ul>
    </section>
  );
}
