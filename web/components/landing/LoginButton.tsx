"use client";

import { useState } from "react";
import styles from "@/components/landing/landing.module.css";
import { PUZZLES_PATH } from "@/lib/browse";
import { signInWithGitHub } from "@/lib/client/auth-client";

/** Starts GitHub sign-in and comes back to the puzzle list. The landing page stays static. */
export function LoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setPending(true);
    setError(null);
    const failed = await signInWithGitHub(PUZZLES_PATH);
    // On success the browser is already leaving for GitHub, so the button stays busy.
    if (failed) {
      setError(failed);
      setPending(false);
    }
  };

  return (
    <span className={styles.loginWrap}>
      <button
        type="button"
        className={`${styles.button} ${styles.secondary}`}
        aria-describedby="login-note"
        aria-busy={pending}
        disabled={pending}
        onClick={() => void signIn()}
        data-testid="log-in"
      >
        {pending ? "Opening GitHub…" : "Sign in with GitHub"}
      </button>
      <span
        id="login-note"
        className={error ? styles.loginError : styles.soon}
        role={error ? "alert" : undefined}
        data-testid="log-in-note"
      >
        {error ?? "to submit answers and save progress"}
      </span>
    </span>
  );
}
