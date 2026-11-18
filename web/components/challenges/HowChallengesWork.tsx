import styles from "@/components/challenges/challenges.module.css";
import { ROTATION } from "@/components/challenges/copy";
import { LocalRotation } from "@/components/challenges/LocalRotation";
import { Icon } from "@/components/site/Icon";
import type { PeriodKind } from "@/lib/api-types";
import { formatNumber } from "@/lib/format";
import { PERIOD_KINDS, PERIOD_LABELS } from "@/lib/periods";
import { SCORING } from "@/lib/scoring";

interface HowChallengesWorkProps {
  /** When each open challenge ends, for the reader's local time next to the UTC rotation. */
  rotations: { kind: PeriodKind; endsAt: string }[];
}

/**
 * The rules, closed until asked for: what a challenge is, when each kind rotates, the bonus, and
 * what keeps a streak. The same for everyone.
 */
export function HowChallengesWork({ rotations }: HowChallengesWorkProps) {
  const { daily, weekly, monthly } = SCORING.challengeBonus;
  const endsAt = new Map(rotations.map((rotation) => [rotation.kind, rotation.endsAt]));
  return (
    <details className={styles.rules} data-testid="challenge-rules">
      <summary className={styles.rulesSummary}>
        <h2 className={styles.rulesTitle}>How challenges work</h2>
        <Icon name="chevron-down" />
      </summary>
      <div className={styles.rulesBody}>
        <ul className={styles.rulesList}>
          <li>
            Everyone gets the same puzzles. A daily challenge is open for one UTC day, a weekly one from Monday to
            Sunday, and a monthly one for the calendar month.
          </li>
          <li>
            Solve a challenge&apos;s puzzle while it&apos;s open to complete it and earn its bonus: +
            {formatNumber(daily)} points for daily, +{formatNumber(weekly)} for weekly and +{formatNumber(monthly)} for
            monthly, once each.
          </li>
          <li>
            Only a first solve counts. If you solved the puzzle before the challenge began, its solution is already
            open to you, so solving it again doesn&apos;t complete the challenge.
          </li>
          <li>After a challenge ends, its puzzle stays open to practice, but it no longer earns the bonus.</li>
          <li>
            Complete the daily challenge on its UTC day to keep your streak. Solving it on a later day still counts as
            practice but not toward the streak or the bonus. Weekly and monthly challenges are tracked separately and
            don&apos;t affect it.
          </li>
          <li>If a challenge&apos;s puzzle is withdrawn, a new challenge starts when that one ends.</li>
        </ul>
        <dl className={styles.rotations}>
          {PERIOD_KINDS.map((kind) => {
            const end = endsAt.get(kind);
            return (
              <div key={kind}>
                <dt>{PERIOD_LABELS[kind]}</dt>
                <dd data-testid="challenge-rotation">
                  {ROTATION[kind]}
                  {end ? <LocalRotation kind={kind} endsAt={end} /> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </details>
  );
}
