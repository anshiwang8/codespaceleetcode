"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/site/Avatar";
import styles from "@/components/site/site.module.css";

/** The header's account area: who's signed in and Sign out, or the ways to sign in. */
export function AuthControl() {
  const { me, devName, gitHubSignIn, devSignIn, signOut, pending } = useAuth();
  // Keeps its place while /api/me answers, so the header doesn't shift.
  if (!me) return <div className={styles.auth} aria-hidden="true" />;

  if (me.user) {
    return (
      <div className={styles.auth}>
        <span className={styles.account} title={`Signed in as ${me.user.login}`}>
          <Avatar login={me.user.login} />
          <span className="visually-hidden">Signed in as </span>
          <span className={styles.login} data-testid="signed-in-as">
            {me.user.login}
          </span>
        </span>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void signOut()}
          disabled={pending}
          aria-busy={pending}
        >
          Sign out
        </button>
      </div>
    );
  }
  if (!me.githubAuth && !me.devAuth) return <div className={styles.auth} />;
  return (
    <div className={styles.auth}>
      {me.githubAuth ? (
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() => void gitHubSignIn()}
          disabled={pending}
          aria-busy={pending}
          data-testid="github-sign-in"
        >
          <span>
            Sign in<span className={styles.authDetail}> with GitHub</span>
          </span>
        </button>
      ) : null}
      {me.devAuth ? (
        <>
          <span className={styles.devLabel}>Local dev sign-in, no account</span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void devSignIn()}
            disabled={pending}
            aria-busy={pending}
          >
            <span>
              Sign in<span className={styles.authDetail}>{devName ? ` as ${devName}` : ""}</span>
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}

/**
 * A failed sign-in or sign-out, shown under the header rather than squeezed into it, so a long
 * message can wrap on a phone.
 */
export function AuthErrorBanner() {
  const { error, clearError } = useAuth();
  if (!error) return null;
  return (
    <div className={styles.authBanner} role="alert" data-testid="auth-error">
      <p>
        <span aria-hidden="true">⚠ </span>
        {error}
      </p>
      <button type="button" className="btn btn-small btn-quiet" onClick={clearError}>
        Dismiss
      </button>
    </div>
  );
}
