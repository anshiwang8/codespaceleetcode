"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/profile/profile.module.css";
import { api, ApiRequestError } from "@/lib/client/api";

/** Deleting takes two clicks: one to open the warning, one to confirm. */
export function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section className={styles.danger} aria-labelledby="delete-account-heading" data-testid="delete-account">
      <h2 id="delete-account-heading">Delete account</h2>
      {confirming ? (
        <>
          <p>
            This permanently deletes your account, your submissions and your progress, and signs you out. It
            can&apos;t be undone. Signing in with GitHub again later starts a new, empty account.
          </p>
          <p className={styles.dangerActions}>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => void remove()}
              disabled={busy}
              data-testid="delete-account-confirm"
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </p>
        </>
      ) : (
        <p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setConfirming(true)}
            data-testid="delete-account-start"
          >
            Delete account…
          </button>
        </p>
      )}
      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.legalLinks}>
        <Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms</Link>
      </p>
    </section>
  );
}
