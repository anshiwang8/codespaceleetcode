import { createAuthClient } from "better-auth/client";

// Same origin as the app, so Better Auth finds its routes at /api/auth without a base URL.
const authClient = createAuthClient();

/**
 * Starts GitHub sign-in. On success the browser leaves for GitHub, then comes back to
 * `returnTo`. Resolves to a message to show if it couldn't start.
 */
export async function signInWithGitHub(returnTo: string): Promise<string | null> {
  try {
    const { error } = await authClient.signIn.social({ provider: "github", callbackURL: returnTo });
    if (!error) return null;
    // Better Auth answers this way when no GitHub OAuth app is configured on the server.
    if (error.status === 404 || error.code === "PROVIDER_NOT_FOUND") {
      return "GitHub sign-in isn't set up on this server yet.";
    }
    return error.message ?? "GitHub sign-in couldn't start. Try again.";
  } catch {
    return "GitHub sign-in couldn't start. Check your connection and try again.";
  }
}

/** Ends the Better Auth session. Resolves to a message to show if that failed. */
export async function signOutOfGitHub(): Promise<string | null> {
  try {
    const { error } = await authClient.signOut();
    return error ? (error.message ?? "Sign-out failed") : null;
  } catch {
    return "Sign-out failed. Check your connection and try again.";
  }
}
