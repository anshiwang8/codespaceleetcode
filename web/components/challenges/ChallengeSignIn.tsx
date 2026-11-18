"use client";

import styles from "@/components/challenges/challenges.module.css";
import { useAuth } from "@/components/auth/AuthProvider";

/** The sign-in buttons for the signed-out panel. The space they take is reserved while /api/me answers. */
export function ChallengeSignIn() {
  const { me, devName, gitHubSignIn, devSignIn, error, pending } = useAuth();
  const unavailable = me !== null && !me.githubAuth && !me.devAuth;
  return (
    <div className={styles.signIn} role="status" aria-busy={me === null} data-testid="challenge-sign-in">
      <p className={styles.signInActions}>
        {me === null ? <span className="faint">Checking whether you&apos;re signed in…</span> : null}
        {unavailable ? <span className="faint">Sign-in isn&apos;t available right now. Please try again later.</span> : null}
        {me?.githubAuth ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void gitHubSignIn()}
            disabled={pending}
            aria-busy={pending}
          >
            Sign in with GitHub
          </button>
        ) : null}
        {me?.devAuth ? (
          <button type="button" className="btn" onClick={() => void devSignIn()} disabled={pending} aria-busy={pending}>
            Local dev sign-in{devName ? ` as ${devName}` : ""}
          </button>
        ) : null}
      </p>
      {error ? (
        <p className={styles.signInError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
