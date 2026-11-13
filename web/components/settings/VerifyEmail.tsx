"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { ApiRequestError, api } from "@/lib/client/api";
import { Icon } from "@/components/site/Icon";

type State =
  | { kind: "waiting" }
  | { kind: "verifying" }
  | { kind: "done"; address: string | null }
  | { kind: "failed"; text: string; expired: boolean };

/**
 * Confirms an email from its link. The token is read from the URL, sent once in a POST (so a link
 * preview or prefetch can't confirm anything), and removed from the address bar.
 */
export function VerifyEmail() {
  const { me, updateAccount } = useAuth();
  const [state, setState] = useState<State>({ kind: "waiting" });
  const started = useRef(false);

  useEffect(() => {
    if (!me?.user || started.current) return;
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    started.current = true;
    const login = me.user.login;
    window.history.replaceState(null, "", "/settings/email/verify");
    setState({ kind: "verifying" });
    api.verifyEmail(token).then(
      (status) => {
        setState({ kind: "done", address: status.address });
        updateAccount(login, { needsEmail: status.address === null });
      },
      (caught: unknown) =>
        setState({
          kind: "failed",
          text: caught instanceof ApiRequestError ? caught.message : "Couldn't confirm the address. Try the link again.",
          expired: caught instanceof ApiRequestError && caught.code === "expired",
        }),
    );
  }, [me, updateAccount]);

  if (me && !me.user) {
    return (
      <main className="page-message" data-testid="verify-signed-out">
        <h1>Confirm your email</h1>
        <p className="muted">Sign in with the account you asked from, and this page confirms the address.</p>
        <SignInPrompt reason="Sign in to confirm your email." />
      </main>
    );
  }
  return (
    <main className="page-message" data-testid="verify-email" aria-busy={state.kind === "verifying" || state.kind === "waiting"}>
      <h1>Confirm your email</h1>
      {state.kind === "done" ? (
        <>
          <p role="status" data-testid="verify-done">
            <span className="badge badge-ok">
              <Icon name="check" /> Confirmed
            </span>{" "}
            {state.address ? <>Your contact email is now <strong>{state.address}</strong>.</> : "Your email is confirmed."}
          </p>
          <p className="actions">
            <Link href="/settings#email" className="btn btn-primary">
              Back to settings
            </Link>
            <Link href="/puzzles" className="btn">
              Browse puzzles
            </Link>
          </p>
        </>
      ) : state.kind === "failed" ? (
        <>
          <p className="notice notice-error" role="alert" data-testid="verify-failed">
            {state.text}
          </p>
          <p className="actions">
            <Link href="/settings#email" className="btn btn-primary">
              {state.expired ? "Send a new link" : "Go to email settings"}
            </Link>
          </p>
        </>
      ) : (
        <p className="muted" role="status">
          Confirming…
        </p>
      )}
    </main>
  );
}
