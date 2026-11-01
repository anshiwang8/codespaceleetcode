"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import styles from "@/components/site/site.module.css";

export function AuthControl() {
  const { me, devName, signIn, signOut, error } = useAuth();
  if (!me) return <div className={styles.auth} aria-hidden="true" />;
  if (me.user) {
    return (
      <div className={styles.auth}>
        <span className="mono" data-testid="signed-in-as">
          {me.user.login}
        </span>
        {me.devAuth ? (
          <button type="button" className="btn btn-small" onClick={() => void signOut()}>
            Sign out
          </button>
        ) : null}
      </div>
    );
  }
  if (!me.devAuth) return <div className={styles.auth} />;
  return (
    <div className={styles.auth}>
      {error ? (
        <span className={styles.authError} role="alert">
          {error}
        </span>
      ) : null}
      <span className={styles.devLabel}>Local dev sign-in, no account</span>
      <button type="button" className="btn btn-small" onClick={() => void signIn()}>
        Sign in{devName ? ` as ${devName}` : ""}
      </button>
    </div>
  );
}
