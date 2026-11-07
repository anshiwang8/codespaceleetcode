"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "@/components/settings/settings.module.css";
import type { EmailStatus } from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";
import { signInWithGitHub } from "@/lib/client/auth-client";
import { formatDateTime } from "@/lib/format";
import { Icon } from "@/components/site/Icon";

/**
 * The contact email: set it for the first time, confirm it, or change it. The verified address
 * stays in use until a new one is confirmed.
 */
export function EmailPanel({ initial, provider }: { initial: EmailStatus; provider: "github" | "dev" }) {
  const { refresh } = useAuth();
  const [status, setStatus] = useState(initial);
  const [editing, setEditing] = useState(!initial.address && !initial.pending);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string; code?: string | null } | null>(null);

  async function run(action: () => Promise<EmailStatus>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await action();
      setStatus(next);
      setEditing(false);
      setAddress("");
      setMessage({ kind: "info", text: success });
      void refresh();
    } catch (caught) {
      setMessage({
        kind: "error",
        text: caught instanceof ApiRequestError ? caught.message : "Something went wrong. Check your connection and try again.",
        code: caught instanceof ApiRequestError ? caught.code : null,
      });
    } finally {
      setBusy(false);
    }
  }

  const pending = status.pending;
  const reauth = message?.code === "reauth" || (Boolean(status.address) && editing && !status.recentSignIn);

  return (
    <div className={styles.email} data-testid="email-panel">
      {status.address ? (
        <p className={styles.emailCurrent} data-testid="email-current">
          <span className="badge badge-ok">
            <Icon name="check" /> Verified
          </span>{" "}
          <strong className={styles.emailAddress}>{status.address}</strong>
        </p>
      ) : (
        <p className={styles.hint}>
          codebases uses this address only to reach you about your account, such as a change to your email. It
          isn&apos;t shown to anyone, and you still sign in with GitHub.
        </p>
      )}

      {!status.deliveryAvailable ? (
        <p className="notice" role="status" data-testid="email-unavailable">
          This server can&apos;t send email yet, so a new address can&apos;t be confirmed. Nothing has been changed.
        </p>
      ) : status.localOutbox ? (
        <p className={styles.hint} data-testid="email-local">
          Local development: messages are saved to <code>web/.dev-outbox/</code> instead of being sent.
        </p>
      ) : null}

      {pending ? (
        <div className={pending.expired ? "notice notice-error" : "notice"} data-testid="email-pending">
          {pending.expired ? (
            <p>
              The link sent to <strong className={styles.emailAddress}>{pending.address}</strong> has expired.
            </p>
          ) : (
            <p>
              We sent a confirmation link to <strong className={styles.emailAddress}>{pending.address}</strong>. Open
              it while signed in. It expires {formatDateTime(pending.expiresAt)}.
              {status.address ? " Your current address stays in use until then." : ""}
            </p>
          )}
          <p className={styles.actions}>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void run(api.resendEmail, "A new link is on its way. The earlier one no longer works.")}
              disabled={busy || !status.deliveryAvailable}
              data-testid="email-resend"
            >
              Send a new link
            </button>
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing(true)} disabled={busy}>
              Use a different address
            </button>
            {status.address ? (
              <button
                type="button"
                className="btn btn-small btn-quiet"
                onClick={() => void run(api.cancelEmail, "Change canceled. Your current address stays.")}
                disabled={busy}
                data-testid="email-cancel-change"
              >
                Cancel change
              </button>
            ) : null}
          </p>
        </div>
      ) : null}

      {status.address && !editing && !pending ? (
        <button type="button" className="btn btn-small" onClick={() => setEditing(true)} data-testid="email-change">
          Change email
        </button>
      ) : null}

      {editing ? (
        <form
          className={styles.emailForm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => api.requestEmail(address),
              "Check your inbox for a confirmation link. If it doesn't arrive in a few minutes, send a new one.",
            );
          }}
        >
          <label htmlFor="email-address" className="field-label">
            {status.address ? "New email address" : "Email address"}
          </label>
          <div className={styles.inline}>
            <input
              id="email-address"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={message?.kind === "error" && message.code === "invalid" ? true : undefined}
              aria-describedby={message?.kind === "error" ? "email-error" : undefined}
              disabled={!status.deliveryAvailable}
              data-testid="email-input"
            />
            <button
              type="submit"
              className="btn btn-primary pending-track"
              disabled={busy || !status.deliveryAvailable || address.trim() === ""}
              aria-busy={busy}
              data-testid="email-submit"
            >
              {busy ? "Sending…" : "Send confirmation link"}
            </button>
            {status.address || pending ? (
              <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {reauth && provider === "github" ? (
        <div className="notice" data-testid="email-reauth">
          <p>For your security, changing a verified email needs a GitHub sign-in from the last 15 minutes.</p>
          <p className={styles.actions}>
            <button
              type="button"
              className="btn btn-small btn-primary"
              onClick={() => void signInWithGitHub("/settings#email")}
            >
              Sign in with GitHub again
            </button>
          </p>
        </div>
      ) : null}

      {message ? (
        <p
          id={message.kind === "error" ? "email-error" : undefined}
          className={message.kind === "error" ? styles.fieldError : styles.saveNote}
          role={message.kind === "error" ? "alert" : "status"}
          data-testid="email-message"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
