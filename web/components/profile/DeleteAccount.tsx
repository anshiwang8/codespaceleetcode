"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/profile/profile.module.css";
import { api, ApiRequestError } from "@/lib/client/api";

/** Deleting takes two clicks: one to open the warning, one to confirm. Cancel closes the warning. */
export function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  // Focus follows the step: onto the warning's Cancel when it opens, back to the start when it closes.
  useEffect(() => {
    if (confirming) {
      opened.current = true;
      cancelRef.current?.focus();
    } else if (opened.current) {
      startRef.current?.focus();
    }
  }, [confirming]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      // The landing page sits outside the signed-in shell, so nothing there remembers the user.
      // refresh() drops cached pages that were rendered for them.
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Couldn't delete your account. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.danger} role="group" aria-labelledby="delete-account-heading" data-testid="delete-account">
      <div className={styles.accountRow}>
        <div>
          <h3 id="delete-account-heading" className={styles.cardTitle}>
            Delete account
          </h3>
          <p className={styles.cardNote}>Permanently removes your account, submissions and progress.</p>
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
        <div className={styles.dangerConfirm}>
          <p>
            <strong>This can&apos;t be undone.</strong> It permanently deletes your account, every submission and
            all your progress, and signs you out. Signing in with GitHub again later starts a new, empty account.
          </p>
          <p className={styles.dangerActions}>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => void remove()}
              disabled={busy}
              aria-busy={busy}
              data-testid="delete-account-confirm"
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-small"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={busy}
              data-testid="delete-account-cancel"
            >
              Cancel
            </button>
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
