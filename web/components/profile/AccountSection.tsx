"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import styles from "@/components/profile/profile.module.css";

/** Sign out, the legal pages, and, set apart, deleting the account. */
export function AccountSection() {
  const { signOut, pending } = useAuth();
  return (
    <section className={`card ${styles.account}`} aria-labelledby="account-heading" data-testid="account-section">
      <h2 id="account-heading" className="section-title">
        Account
      </h2>
      <div className={styles.accountRow}>
        <div>
          <h3 className={styles.cardTitle}>Sign out</h3>
          <p className={styles.cardNote}>Ends your session in this browser. Your progress is kept.</p>
        </div>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void signOut()}
          disabled={pending}
          aria-busy={pending}
          data-testid="profile-sign-out"
        >
          Sign out
        </button>
      </div>
      <div className={styles.accountRow}>
        <div>
          <h3 className={styles.cardTitle}>Your data</h3>
          <p className={styles.cardNote}>What codebases keeps about you, and the rules for using it.</p>
        </div>
        <p className={styles.legalLinks}>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </div>
      <DeleteAccount />
    </section>
  );
}
