"use client";

import Link from "next/link";
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
        <Link
          href="/settings"
          className={styles.account}
          title={`Signed in as ${me.user.login}. Account settings`}
          data-testid="account-link"
        >
          <Avatar version={me.user.avatarVersion} />
          <span className="visually-hidden">Signed in as </span>
          <span className={styles.login} data-testid="signed-in-as">
            {me.user.login}
          </span>
          <span className="visually-hidden">, account settings</span>
        </Link>
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
 * Until a contact email is verified, account setup isn't finished. This says so under the header,
 * with a way to finish. It doesn't block practice.
 */
export function EmailSetupBanner() {
  const { me } = useAuth();
  if (!me?.user?.needsEmail) return null;
  return (
    <div className={styles.setupBanner} data-testid="email-setup-banner">
      <p>
        <strong>Finish setting up your account:</strong> add an email address codebases can reach you at.
      </p>
      <Link href="/settings/email" className="btn btn-small btn-primary">
        Add email
      </Link>
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
