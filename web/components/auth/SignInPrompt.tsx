"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/** Inline prompt for signed-out users. `reason` says what signing in is needed for. */
export function SignInPrompt({ reason }: { reason: string }) {
  const { me, devName, gitHubSignIn, devSignIn, error } = useAuth();
  if (!me?.githubAuth && !me?.devAuth) {
    return (
      <div className="notice" role="status" data-testid="sign-in-prompt">
        <p>{reason}</p>
        <p style={{ marginTop: 6 }}>Sign-in isn&apos;t available on this server yet.</p>
      </div>
    );
  }
  return (
    <div className="notice" role="status" data-testid="sign-in-prompt">
      <p>{reason}</p>
      <p style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {me.githubAuth ? (
          <button type="button" className="btn btn-primary" onClick={() => void gitHubSignIn()}>
            Sign in with GitHub
          </button>
        ) : null}
        {me.devAuth ? (
          <button type="button" className="btn" onClick={() => void devSignIn()}>
            Local dev sign-in{devName ? ` as ${devName}` : ""}
          </button>
        ) : null}
      </p>
      {error ? (
        <p style={{ marginTop: 6 }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
