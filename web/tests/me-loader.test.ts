import { describe, expect, it } from "vitest";
import type { MeResponse } from "@/lib/api-types";
import { createMeLoader } from "@/lib/client/me-loader";

const signedIn = (login: string): MeResponse => ({
  user: { login, via: "github", displayName: null, avatarVersion: null, needsEmail: false, appearance: { preference: null, favorites: [] } },
  githubAuth: true,
  devAuth: false,
});
const signedOut: MeResponse = { user: null, githubAuth: true, devAuth: false };

/** A request the test answers by hand, in whatever order it likes. */
function deferred() {
  let resolve!: (value: MeResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<MeResponse>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup() {
  const requests: ReturnType<typeof deferred>[] = [];
  const shown: (string | null)[] = [];
  const loader = createMeLoader(
    () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
    (me) => shown.push(me.user?.login ?? null),
  );
  return { loader, requests, shown };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ordering /api/me answers", () => {
  it("never lets an older answer replace a newer one", async () => {
    const { loader, requests, shown } = setup();
    const first = loader.load("fresh");
    const second = loader.load("fresh");
    requests[1]?.resolve(signedIn("new-name"));
    expect(await second).toMatchObject({ user: { login: "new-name" } });
    requests[0]?.resolve(signedIn("old-name"));
    expect(await first).toBeNull();
    expect(shown).toEqual(["new-name"]);
  });

  it("keeps a sign-out even when a refresh from before it answers afterwards", async () => {
    const { loader, requests, shown } = setup();
    const refresh = loader.load("fresh");
    const signOut = deferred();
    const change = loader.change(() => signOut.promise);
    signOut.resolve(signedOut);
    await change;
    requests[0]?.resolve(signedIn("someone"));
    expect(await refresh).toBeNull();
    expect(shown).toEqual([null]);
  });

  it("keeps the new account after switching, whatever the old session's requests say", async () => {
    const { loader, requests, shown } = setup();
    const initial = loader.load("shared");
    requests[0]?.resolve(signedIn("first-person"));
    await initial;
    const stale = loader.load("fresh");
    const switched = deferred();
    const change = loader.change(() => switched.promise);
    switched.resolve(signedIn("second-person"));
    await change;
    requests[1]?.resolve(signedIn("first-person"));
    await stale;
    expect(shown).toEqual(["first-person", "second-person"]);
  });

  it("makes a request asked for during a change wait for it, then ask the server again", async () => {
    const { loader, requests, shown } = setup();
    const signIn = deferred();
    const change = loader.change(() => signIn.promise);
    const during = loader.load("fresh");
    await tick();
    expect(requests).toHaveLength(0);
    signIn.resolve(signedIn("arrived"));
    await change;
    await tick();
    expect(requests).toHaveLength(1);
    requests[0]?.resolve(signedIn("arrived"));
    await during;
    expect(shown).toEqual(["arrived", "arrived"]);
  });

  it("shares one request between loads that ask at once, but a fresh load always asks again", async () => {
    const { loader, requests } = setup();
    const a = loader.load("shared");
    const b = loader.load("shared");
    expect(requests).toHaveLength(1);
    const c = loader.load("fresh");
    expect(requests).toHaveLength(2);
    requests[0]?.resolve(signedIn("x"));
    requests[1]?.resolve(signedIn("x"));
    await Promise.all([a, b, c]);
    expect(loader.settled).toBe(true);
  });

  it("reports a failed change and leaves what's shown alone", async () => {
    const { loader, shown } = setup();
    await expect(loader.change(() => Promise.reject(new Error("Sign-out failed")))).rejects.toThrow("Sign-out failed");
    expect(shown).toEqual([]);
    expect(loader.settled).toBe(false);
  });

  it("applies a confirmed save to the same account only, and drops requests from before it", async () => {
    const { loader, requests, shown } = setup();
    expect(loader.update("someone", { displayName: "Early" })).toBe(false);
    const initial = loader.load("shared");
    requests[0]?.resolve(signedIn("saver"));
    await initial;
    const before = loader.load("fresh");
    expect(loader.update("saver", { displayName: "New name", avatarVersion: "0123456789abcdef" })).toBe(true);
    requests[1]?.resolve(signedIn("saver"));
    expect(await before).toBeNull();
    expect(shown).toEqual(["saver", "saver"]);
    // Someone else's save never changes this account.
    expect(loader.update("another-person", { displayName: "Theirs" })).toBe(false);
    expect(shown).toHaveLength(2);
  });

  it("never applies a save while a sign-out is under way, so the sign-out still wins", async () => {
    const shownUsers: (NonNullable<MeResponse["user"]> | null)[] = [];
    const requests: ReturnType<typeof deferred>[] = [];
    const loader = createMeLoader(
      () => {
        const request = deferred();
        requests.push(request);
        return request.promise;
      },
      (me) => shownUsers.push(me.user),
    );
    const initial = loader.load("shared");
    requests[0]?.resolve(signedIn("leaving"));
    await initial;
    const signOut = deferred();
    const change = loader.change(() => signOut.promise);
    expect(loader.update("leaving", { displayName: "Late save" })).toBe(false);
    signOut.resolve(signedOut);
    await change;
    expect(shownUsers.at(-1)).toBeNull();
    expect(shownUsers.some((user) => user?.displayName === "Late save")).toBe(false);
  });
});
