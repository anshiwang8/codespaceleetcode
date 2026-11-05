"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MeResponse } from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";
import { signInWithGitHub, signOutOfGitHub } from "@/lib/client/auth-client";

const DEV_NAME_KEY = "cp-dev-login";

/** A name remembered per browser, so signing back in returns to the same progress. */
function devLoginName(): string {
  const generate = () => `dev-${Math.random().toString(16).slice(2, 6)}`;
  try {
    const saved = window.localStorage.getItem(DEV_NAME_KEY);
    if (saved) return saved;
    const name = generate();
    window.localStorage.setItem(DEV_NAME_KEY, name);
    return name;
  } catch {
    return generate();
  }
}

interface AuthValue {
  /** Null until /api/me has answered. */
  me: MeResponse | null;
  /** The name the dev sign-in button will use. Null until known, which is after mount. */
  devName: string | null;
  error: string | null;
  /** Leaves for GitHub, then comes back to this page. */
  gitHubSignIn: () => Promise<void>;
  /** The localhost-only dev login. */
  devSignIn: () => Promise<void>;
  /** Ends whichever kind of session this is. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [devName, setDevName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .catch((): MeResponse => ({ user: null, githubAuth: false, devAuth: false }))
      .then((response) => {
        if (cancelled) return;
        setMe(response);
        setDevName(devLoginName());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const change = useCallback(
    async (request: () => Promise<MeResponse>) => {
      setError(null);
      try {
        setMe(await request());
        // Server components read the cookie, so progress on the page has to be fetched again.
        router.refresh();
      } catch (cause) {
        setError(cause instanceof ApiRequestError || cause instanceof Error ? cause.message : "Sign-in failed");
      }
    },
    [router],
  );

  const gitHubSignIn = useCallback(async () => {
    setError(null);
    const failed = await signInWithGitHub(window.location.pathname + window.location.search);
    if (failed) setError(failed);
  }, []);

  const signOut = useCallback(async () => {
    if (me?.user?.via !== "github") return change(api.devLogout);
    return change(async () => {
      const failed = await signOutOfGitHub();
      if (failed) throw new Error(failed);
      // On localhost a dev login cookie may be left behind, which would sign the user back in.
      return me.devAuth ? api.devLogout() : api.me();
    });
  }, [me, change]);

  const value = useMemo<AuthValue>(
    () => ({
      me,
      devName,
      error,
      gitHubSignIn,
      devSignIn: () => change(() => api.devLogin(devName ?? devLoginName())),
      signOut,
    }),
    [me, devName, error, change, gitHubSignIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
