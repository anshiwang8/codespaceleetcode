import type { MeResponse } from "@/lib/api-types";

/** What a settings save can change about the signed-in account, as the header shows it. */
export type AccountChanges = Partial<Pick<NonNullable<MeResponse["user"]>, "displayName" | "avatarVersion" | "needsEmail">>;

// Who's signed in, as the browser learns it from /api/me. Answers can arrive out of order: a
// refresh started before a sign-out can land after it, and would put the old account back on
// screen. So every request is numbered when it starts, and an answer is used only if nothing that
// started later has been used already. A sign-in, sign-out or deletion numbers its own answer
// too, and requests made while one is under way wait for it instead of racing it.
//
// A save that the server confirmed (a new display name, picture or email) updates the answer in
// place instead of asking /api/me again, but only for the account that made it, and never while
// a sign-in or sign-out is under way.
//
// Nothing here is stored beyond the page's memory: a reload or another tab asks the server again.

export interface MeLoader {
  /**
   * Asks /api/me. `shared` joins a request already in flight (the first load, and React's
   * double-run of effects in development); a refresh after a change passes `fresh`, since a
   * request that started before the change may not include it. Resolves to the answer that was
   * used, or null when a newer one had already been used.
   */
  load(mode: "shared" | "fresh"): Promise<MeResponse | null>;
  /** Runs a change of who's signed in. Its answer wins over every request that started before it. */
  change(request: () => Promise<MeResponse>): Promise<MeResponse>;
  /**
   * Applies a confirmed save to the account on screen. Returns false, changing nothing, when
   * `login` isn't the account on screen, nothing is known yet, or a sign-in or sign-out is under
   * way; the caller then asks the server instead. Requests that started before it are dropped.
   */
  update(login: string, changes: AccountChanges): boolean;
  /** Whether any answer has been used yet. */
  readonly settled: boolean;
}

export function createMeLoader(fetchMe: () => Promise<MeResponse>, apply: (me: MeResponse) => void): MeLoader {
  let started = 0;
  let applied = 0;
  let inFlight: Promise<MeResponse | null> | null = null;
  let changing: Promise<unknown> | null = null;
  let current: MeResponse | null = null;

  const accept = (ticket: number, me: MeResponse): MeResponse | null => {
    if (ticket <= applied) return null;
    applied = ticket;
    current = me;
    apply(me);
    return me;
  };

  const request = (): Promise<MeResponse | null> => {
    const ticket = ++started;
    const promise = fetchMe().then((me) => accept(ticket, me));
    inFlight = promise;
    const clear = () => {
      if (inFlight === promise) inFlight = null;
    };
    promise.then(clear, clear);
    return promise;
  };

  return {
    async load(mode) {
      // A change under way decides who's signed in; asking alongside it could undo it.
      if (changing) await changing.catch(() => undefined);
      if (mode === "shared" && inFlight) return inFlight;
      return request();
    },
    async change(run) {
      const ticket = ++started;
      const pending = run();
      changing = pending;
      try {
        const me = await pending;
        accept(ticket, me);
        return me;
      } finally {
        if (changing === pending) changing = null;
      }
    },
    update(login, changes) {
      const me = current;
      if (changing || !me?.user || me.user.login !== login) return false;
      accept(++started, { ...me, user: { ...me.user, ...changes } });
      return true;
    },
    get settled() {
      return applied > 0;
    },
  };
}
