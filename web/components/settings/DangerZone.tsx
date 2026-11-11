"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/settings/settings.module.css";
import { Icon } from "@/components/site/Icon";
import { DELETED_DATA, DELETE_CONFIRMATION } from "@/lib/account-deletion";
import { signInWithGitHub } from "@/lib/client/auth-client";

/** Where GitHub sign-in comes back to, so the user lands on this section again. */
const RETURN_TO = "/settings#delete-account";
const GITHUB_APPS = "https://github.com/settings/applications";

type Outcome = { kind: "deleted" } | { kind: "reauth" } | { kind: "error"; message: string };

/** DELETE /api/me with the typed confirmation. Only a 200 counts as deleted. */
async function deleteAccount(): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch("/api/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: DELETE_CONFIRMATION }),
    });
  } catch {
    return { kind: "error", message: "Couldn't reach the server. Your account wasn't deleted. Try again." };
  }
  if (response.status === 200) return { kind: "deleted" };
  const body = (await response.json().catch(() => null)) as { error?: string; reauth?: boolean } | null;
  if (response.status === 403 && body?.reauth === true) return { kind: "reauth" };
  const reason = body?.error ?? "Couldn't delete your account";
  return { kind: "error", message: `${/[.!?]$/.test(reason) ? reason : `${reason}.`} Your account wasn't deleted.` };
}

interface DangerZoneProps {
  /** How this session signed in. Dev-login sessions always count as a recent sign-in. */
  provider: "github" | "dev";
}

/**
 * Deleting the account, set apart at the bottom of Settings. Two steps: "Delete account…" opens
 * what will be lost and asks for the typed confirmation; only then can the account be deleted.
 * Cancel closes it, and focus moves between Cancel and the button that opened it.
 */
export function DangerZone({ provider }: DangerZoneProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (confirming) {
      opened.current = true;
      cancelRef.current?.focus();
    } else if (opened.current) {
      startRef.current?.focus();
    }
  }, [confirming]);

  const matches = typed === DELETE_CONFIRMATION;

  function close() {
    setConfirming(false);
    setTyped("");
    setOutcome(null);
    setSignInError(null);
  }

  async function remove() {
    if (!matches) return;
    setBusy(true);
    setOutcome(null);
    setSignInError(null);
    const result = await deleteAccount();
    setOutcome(result);
    if (result.kind === "deleted") {
      // The landing page sits outside the signed-in shell, so nothing there remembers the user.
      // refresh() drops cached pages that were rendered for them.
      router.replace("/");
      router.refresh();
      return;
    }
    setBusy(false);
  }

  async function signInAgain() {
    setSignInError(null);
    const failed = await signInWithGitHub(RETURN_TO);
    if (failed) setSignInError(failed);
  }

  return (
    <section
      id="delete-account"
      className={`card ${styles.section} ${styles.danger}`}
      aria-labelledby="danger-heading"
      data-testid="delete-account"
    >
      <h2 id="danger-heading" className="section-title">
        Danger zone
      </h2>
      <div className={styles.dangerRow}>
        <div>
          <h3 className={styles.subheading}>Delete account</h3>
          <p className={styles.hint}>
            Permanently deletes your codebases account and everything in it. Your GitHub account isn&apos;t affected.
          </p>
        </div>
        {confirming ? null : (
          <button
            ref={startRef}
            type="button"
            className="btn btn-small btn-danger-outline"
            onClick={() => setConfirming(true)}
            data-testid="delete-account-start"
          >
            Delete account…
          </button>
        )}
      </div>

      {confirming ? (
        <div className={styles.dangerConfirm} role="group" aria-labelledby="delete-confirm-heading">
          <p id="delete-confirm-heading">
            <strong>This can&apos;t be undone.</strong> Deleting your account removes, for good:
          </p>
          <ul className={styles.deletedList}>
            {DELETED_DATA.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            It deletes your codebases account only, not your GitHub account. To also remove codebases&apos; access
            to GitHub, open GitHub&apos;s Settings, then Applications, then Authorized OAuth Apps, and revoke
            codebases there (
            <a href={GITHUB_APPS} target="_blank" rel="noreferrer">
              github.com/settings/applications
            </a>
            ). Signing in with GitHub again later starts a new, empty account.
          </p>
          {provider === "github" ? (
            <p className={styles.hint}>
              For your security, deleting needs a GitHub sign-in from the last 15 minutes. If yours is older,
              you&apos;ll be asked to sign in again first.
            </p>
          ) : null}

          <div className={styles.field}>
            <label htmlFor="delete-confirm-input" className="field-label">
              Type <strong className={styles.confirmWord}>{DELETE_CONFIRMATION}</strong> to confirm
            </label>
            <input
              id="delete-confirm-input"
              className={`input ${styles.confirmInput}`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              aria-describedby="delete-confirm-hint"
              data-testid="delete-account-input"
            />
            <p id="delete-confirm-hint" className={styles.hint}>
              In capital letters, exactly as shown.
            </p>
          </div>

          <p className={styles.dangerActions}>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => void remove()}
              disabled={busy || !matches}
              aria-busy={busy}
              data-testid="delete-account-confirm"
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-small"
              onClick={close}
              disabled={busy}
              data-testid="delete-account-cancel"
            >
              Cancel
            </button>
          </p>

          {outcome?.kind === "reauth" ? (
            <div className="notice" role="alert" data-testid="delete-account-reauth">
              <p>For your security, sign in with GitHub again, then delete your account.</p>
              <p className={styles.actions}>
                <button type="button" className="btn btn-small btn-primary" onClick={() => void signInAgain()}>
                  Sign in with GitHub again
                </button>
              </p>
              {signInError ? <p className={styles.fieldError}>{signInError}</p> : null}
            </div>
          ) : null}
          {outcome?.kind === "error" ? (
            <p className="notice notice-error" role="alert" data-testid="delete-account-error">
              {outcome.message}
            </p>
          ) : null}
          {outcome?.kind === "deleted" ? (
            <p className={styles.saveDone} role="status" data-testid="delete-account-done">
              <Icon name="check" /> Your account was deleted. Taking you to the home page…
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
