import Link from "next/link";
import { ProgressFill } from "@/components/motion/ProgressFill";
import styles from "@/components/profile/profile.module.css";
import { Avatar } from "@/components/site/Avatar";
import type { ProfileIdentity, ProfileProgress } from "@/lib/api-types";
import { PUZZLES_PATH } from "@/lib/browse";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * Who this is, and lifetime totals in one band. Read-only: the login and name come from GitHub.
 * Distinct puzzles and graded submissions are kept apart, since one puzzle can have many
 * submissions.
 */
export function IdentityCard({ identity, progress }: { identity: ProfileIdentity; progress: ProfileProgress }) {
  const attempted = progress.solved + progress.attempted;
  return (
    <section className={`card ${styles.identity}`} aria-labelledby="profile-heading" data-testid="profile-identity">
      <div className={styles.identityTop}>
        <Avatar login={identity.login} size="large" />
        <div className={styles.identityText}>
          <h1 id="profile-heading" className={styles.login}>
            {identity.login}
          </h1>
          {identity.displayName ? <p className={styles.displayName}>{identity.displayName}</p> : null}
          <ul className={styles.identityMeta}>
            <li>
              {identity.provider === "github" ? (
                <span className="badge badge-info" data-testid="profile-provider">
                  GitHub account
                </span>
              ) : (
                <span className="badge badge-warn" data-testid="profile-provider">
                  Local development account
                </span>
              )}
            </li>
            <li className="muted" data-testid="profile-member-since">
              Member since{" "}
              <time className="mono" dateTime={identity.memberSince}>
                {formatDate(identity.memberSince)}
              </time>
            </li>
            {identity.githubUrl ? (
              <li>
                <a href={identity.githubUrl} rel="noopener noreferrer" target="_blank" data-testid="profile-github-link">
                  GitHub profile<span aria-hidden="true"> ↗</span>
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ) : null}
          </ul>
          {identity.provider === "dev" ? (
            <p className={styles.devNote}>This account exists only on this local server. It isn&apos;t linked to GitHub.</p>
          ) : null}
        </div>
        <Link href={PUZZLES_PATH} className={`btn btn-primary ${styles.identityAction}`} data-testid="profile-browse">
          Browse puzzles
        </Link>
      </div>

      <dl className={styles.summary} data-testid="profile-summary">
        <div data-testid="summary-solved">
          <dt>Solved</dt>
          <dd className={styles.summaryValue}>{formatNumber(progress.solved)}</dd>
          <dd className={styles.summaryNote}>distinct puzzles</dd>
        </div>
        <div data-testid="summary-attempted">
          <dt>Attempted</dt>
          <dd className={styles.summaryValue}>{formatNumber(attempted)}</dd>
          <dd className={styles.summaryNote}>distinct puzzles, solved ones included</dd>
        </div>
        <div data-testid="summary-in-progress">
          <dt>In progress</dt>
          <dd className={styles.summaryValue}>{formatNumber(progress.attempted)}</dd>
          <dd className={styles.summaryNote}>attempted, not solved yet</dd>
        </div>
        <div data-testid="summary-completion">
          <dt>Completion</dt>
          <dd className={styles.summaryValue}>{progress.completionPercent}%</dd>
          <dd className={styles.summaryNote} data-testid="stats-total">
            {formatNumber(progress.solved)} of {formatNumber(progress.total)} available puzzles solved
          </dd>
          <dd>
            <div
              className={`meter ${styles.summaryMeter}`}
              role="progressbar"
              aria-label="Completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.completionPercent}
              aria-valuetext={`${progress.completionPercent}% complete`}
            >
              <ProgressFill percent={progress.completionPercent} />
            </div>
          </dd>
        </div>
        <div className={styles.summarySupport} data-testid="summary-submissions">
          <dt>Submissions</dt>
          <dd className={styles.summaryValue}>{formatNumber(progress.submissions)}</dd>
          <dd className={styles.summaryNote}>graded answers, repeats included</dd>
        </div>
      </dl>
    </section>
  );
}
