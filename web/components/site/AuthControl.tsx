"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import styles from "@/components/site/site.module.css";

export function AuthControl() {
  const { me, devName, gitHubSignIn, devSignIn, signOut, error } = useAuth();
  if (!me) return <div className={styles.auth} aria-hidden="true" />;
  const errorNote = error ? (
    <span className={styles.authError} role="alert">
      {error}
    </span>
  ) : null;

  if (me.user) {
    return (
      <div className={styles.auth}>
        {errorNote}
        <span className="mono" data-testid="signed-in-as">
          {me.user.login}
        </span>
        <button type="button" className="btn btn-small" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }
  if (!me.githubAuth && !me.devAuth) return <div className={styles.auth} />;
  return (
    <div className={styles.auth}>
      {errorNote}
      {me.githubAuth ? (
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() => void gitHubSignIn()}
          data-testid="github-sign-in"
        >
          Sign in with GitHub
        </button>
      ) : null}
      {me.devAuth ? (
        <>
          <span className={styles.devLabel}>Local dev sign-in, no account</span>
          <button type="button" className="btn btn-small" onClick={() => void devSignIn()}>
            Sign in{devName ? ` as ${devName}` : ""}
          </button>
        </>
      ) : null}
    </div>
  );
}
