"use client";

import { useAuth } from "@/components/auth/AuthProvider";

/** Inline prompt for signed-out users. `reason` says what signing in is needed for. */
export function SignInPrompt({ reason }: { reason: string }) {
  const { me, devName, signIn, error } = useAuth();
  if (me?.devAuth) {
    return (
      <div className="notice" role="status" data-testid="sign-in-prompt">
        <p>{reason}</p>
        <p style={{ marginTop: 6 }}>
          <button type="button" className="btn" onClick={() => void signIn()}>
            Local dev sign-in{devName ? ` as ${devName}` : ""}
          </button>
        </p>
        {error ? <p style={{ marginTop: 6 }}>{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="notice" role="status" data-testid="sign-in-prompt">
      <p>{reason}</p>
      <p style={{ marginTop: 6 }}>Sign-in isn&apos;t available on this server yet.</p>
    </div>
  );
}
