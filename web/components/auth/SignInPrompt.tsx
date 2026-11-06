"use client";

import styles from "@/components/auth/sign-in.module.css";
import { useAuth } from "@/components/auth/AuthProvider";

/** Inline prompt for signed-out users. `reason` says what signing in is needed for. */
export function SignInPrompt({ reason }: { reason: string }) {
  const { me, devName, gitHubSignIn, devSignIn, error, pending } = useAuth();
  if (me === null) {
    return (
      <div className={`notice ${styles.prompt}`} role="status" aria-busy="true" data-testid="sign-in-prompt">
        <p>{reason}</p>
        <p className="faint">Checking whether you&apos;re signed in…</p>
      </div>
    );
  }
  if (!me.githubAuth && !me.devAuth) {
    return (
      <div className={`notice ${styles.prompt}`} role="status" data-testid="sign-in-prompt">
        <p>{reason}</p>
        <p className="faint">Sign-in isn&apos;t available right now. Please try again later.</p>
      </div>
    );
  }
  return (
    <div className={`notice ${styles.prompt}`} role="status" data-testid="sign-in-prompt">
      <p>{reason}</p>
      <p className={styles.actions}>
        {me.githubAuth ? (
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
        {me.devAuth ? (
          <button type="button" className="btn" onClick={() => void devSignIn()} disabled={pending} aria-busy={pending}>
            Local dev sign-in{devName ? ` as ${devName}` : ""}
          </button>
        ) : null}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
