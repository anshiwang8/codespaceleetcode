import styles from "@/components/profile/profile.module.css";
import { Avatar } from "@/components/site/Avatar";
import type { ProfileIdentity, ProfileProgress } from "@/lib/api-types";
import { formatDate, formatNumber } from "@/lib/format";

/** Who this is. Read-only: the login and name come from GitHub and can't be edited here. */
export function IdentityCard({ identity, progress }: { identity: ProfileIdentity; progress: ProfileProgress }) {
  return (
    <section className={`card ${styles.identity}`} aria-labelledby="profile-heading" data-testid="profile-identity">
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
                <span aria-hidden="true">●</span> GitHub account
              </span>
            ) : (
              <span className="badge badge-warn" data-testid="profile-provider">
                <span aria-hidden="true">◆</span> Local development account
              </span>
            )}
          </li>
          <li className="muted" data-testid="profile-member-since">
            Member since <time dateTime={identity.memberSince}>{formatDate(identity.memberSince)}</time>
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
          <p className={styles.devNote}>
            This account exists only on this local server. It isn&apos;t linked to GitHub.
          </p>
        ) : null}
      </div>
      <p className={styles.identityTotal} data-testid="stats-total">
        <strong className="tabular">{formatNumber(progress.solved)}</strong> of{" "}
        <span className="tabular">{formatNumber(progress.total)}</span> puzzles solved
      </p>
    </section>
  );
}
