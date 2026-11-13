"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MeResponse } from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";
import { signInWithGitHub, signOutOfGitHub } from "@/lib/client/auth-client";
import { createMeLoader, type AccountChanges } from "@/lib/client/me-loader";
import { forgetSignedIn, rememberSignedIn } from "@/lib/returning";
import { adoptAccount, adoptGuest } from "@/lib/themes/controller";

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
  clearError: () => void;
  /** True while a sign-in or sign-out request is in flight. */
  pending: boolean;
  /** Leaves for GitHub, then comes back to this page. */
  gitHubSignIn: () => Promise<void>;
  /** The localhost-only dev login. */
  devSignIn: () => Promise<void>;
  /** Ends whichever kind of session this is. */
  signOut: () => Promise<void>;
  /** Asks /api/me again, after something in the header (picture, name, email) changed. */
  refresh: () => Promise<void>;
  /**
   * After a save the server confirmed for `login`, shows its result in the header without asking
   * /api/me again. If that account isn't the one on screen any more, it asks instead.
   */
  updateAccount: (login: string, changes: AccountChanges) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [devName, setDevName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // One per provider: orders /api/me answers so an old one never replaces a newer sign-in state.
  const [loader] = useState(() => createMeLoader(() => api.me(), setMe));

  // Whoever is signed in decides the theme: their saved one, or this browser's guest choice when
  // nobody is. Switching people replaces the theme, so one person's choice never stays for another.
  const themeOwner = me === null ? null : (me.user?.login ?? "");
  useEffect(() => {
    if (themeOwner === null || !me) return;
    if (me.user) adoptAccount(me.user.login, me.user.appearance);
    else adoptGuest();
    // Only a change of person re-adopts; saving a theme doesn't need a round trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeOwner]);

  // Remembered per browser, so the landing page greets a returning visitor with "To puzzles".
  const signedIn = me?.user != null;
  useEffect(() => {
    if (signedIn) rememberSignedIn();
  }, [signedIn]);

  useEffect(() => {
    let canceled = false;
    // Shared, so React's second run of this effect in development doesn't ask twice.
    loader.load("shared").then(
      (response) => {
        // Only where the dev login exists, so the real site never stores a dev name.
        if (!canceled && response) setDevName(response.devAuth ? devLoginName() : null);
      },
      () => {
        if (!canceled && !loader.settled) setMe({ user: null, githubAuth: false, devAuth: false });
      },
    );
    return () => {
      canceled = true;
    };
  }, [loader]);

  const change = useCallback(
    async (request: () => Promise<MeResponse>) => {
      setError(null);
      setPending(true);
      try {
        await loader.change(request);
        // Server components read the cookie, so progress on the page has to be fetched again.
        router.refresh();
      } catch (cause) {
        setError(cause instanceof ApiRequestError || cause instanceof Error ? cause.message : "Sign-in failed. Try again.");
      } finally {
        setPending(false);
      }
    },
    [router, loader],
  );

  const gitHubSignIn = useCallback(async () => {
    setError(null);
    setPending(true);
    const failed = await signInWithGitHub(window.location.pathname + window.location.search);
    // On success the browser is already leaving for GitHub, so the controls stay busy.
    if (failed) {
      setError(failed);
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const signOut = useCallback(async () => {
    if (me?.user?.via !== "github") {
      return change(async () => {
        const response = await api.devLogout();
        forgetSignedIn();
        return response;
      });
    }
    return change(async () => {
      const failed = await signOutOfGitHub();
      if (failed) throw new Error(failed);
      forgetSignedIn();
      // On localhost a dev login cookie may be left behind, which would sign the user back in.
      return me.devAuth ? api.devLogout() : api.me();
    });
  }, [me, change]);

  const refresh = useCallback(async () => {
    try {
      // Fresh: a request that started before the change being reported may not include it.
      await loader.load("fresh");
    } catch {
      // Keep what's shown; the next navigation asks again.
    }
  }, [loader]);

  const updateAccount = useCallback(
    (login: string, changes: AccountChanges) => {
      if (!loader.update(login, changes)) void refresh();
    },
    [loader, refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      refresh,
      updateAccount,
      me,
      devName,
      error,
      clearError,
      pending,
      gitHubSignIn,
      devSignIn: () => change(() => api.devLogin(devName ?? devLoginName())),
      signOut,
    }),
    [me, devName, error, clearError, pending, change, gitHubSignIn, signOut, refresh, updateAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
