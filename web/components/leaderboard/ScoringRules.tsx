import Link from "next/link";
import styles from "@/components/leaderboard/leaderboard.module.css";
import { VISIBILITY_SETTINGS_HREF } from "@/components/leaderboard/links";
import { Icon } from "@/components/site/Icon";
import { DIFFICULTY_LABELS } from "@/lib/client/labels";
import { formatNumber } from "@/lib/format";
import { PERIOD_KINDS, PERIOD_LABELS } from "@/lib/periods";
import { SCORING, scoreSolve } from "@/lib/scoring";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const n = formatNumber;

/** Every number here comes from SCORING, so the explanation can't drift from what the server awards. */
export function ScoringRules() {
  const example = scoreSolve("medium", true, 1);
  return (
    <section className={`card ${styles.scoring}`} aria-labelledby="scoring-heading" data-testid="leaderboard-scoring">
      <h2 id="scoring-heading" className="section-title">
        How scoring works
      </h2>
      <div className={styles.scoringGrid}>
        <div className={styles.pointTables}>
          <table className={styles.pointTable}>
            <caption>First solve</caption>
            <tbody>
              {DIFFICULTIES.map((difficulty) => (
                <tr key={difficulty}>
                  <th scope="row">
                    <span className={`difficulty-${difficulty}`}>{DIFFICULTY_LABELS[difficulty]}</span>
                  </th>
                  <td>{n(SCORING.base[difficulty])} points</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className={styles.pointTable}>
            <caption>Challenge bonus</caption>
            <tbody>
              {PERIOD_KINDS.map((kind) => (
                <tr key={kind}>
                  <th scope="row">{PERIOD_LABELS[kind]}</th>
                  <td>+{n(SCORING.challengeBonus[kind])} points</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={styles.rules}>
          <li>
            <strong>First try:</strong> {n(SCORING.firstTryBonus)} more points when your first graded answer to the
            puzzle is the correct one.
          </li>
          <li>
            <strong>Hints:</strong> {n(SCORING.hintPenalty)} points off for each hint you reveal before solving. Hints
            revealed after you solve cost nothing.
          </li>
          <li>
            <strong>Minimum:</strong> every solve earns at least {n(SCORING.minimum)} points.
          </li>
          <li>
            <strong>Challenges:</strong> solving a challenge&apos;s puzzle while its period is open adds its bonus, once
            per period.
          </li>
          <li>
            Each puzzle scores once, the first time you solve it. Wrong answers earn nothing, though one before the
            solve means no first-try bonus.
          </li>
          <li>
            Periods are in UTC: days start at 00:00, weeks on Monday, and months on the 1st. On equal points, whoever
            reached the total first ranks higher.
          </li>
          <li>
            Solves from before scoring started got base points, and the first-try bonus where it was recorded, with no
            hint deduction, since hints weren&apos;t recorded then.
          </li>
        </ul>
      </div>
      <p className={styles.example}>
        For example, a medium puzzle solved on the first try after revealing one hint earns {n(example.basePoints)} +{" "}
        {n(example.firstTryBonus)} − {n(example.hintPenalty)} = {n(example.points)} points.
      </p>
      <p className={styles.privacy} data-testid="leaderboard-privacy">
        <Icon name="shield" />
        <span>
          Only people who join appear here, under a public name they choose. No GitHub username, email or picture is
          shown. You can join or leave any time in <Link href={VISIBILITY_SETTINGS_HREF}>Settings</Link>.
        </span>
      </p>
    </section>
  );
}
