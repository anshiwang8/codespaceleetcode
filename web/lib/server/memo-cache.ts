import "server-only";

// A value kept in this server instance's memory for a short time, for public data that changes
// rarely and is the same for everyone. Each Vercel instance has its own copy, so after the data
// changes an instance can serve the old value for at most `ttlMs`; a new deployment starts
// empty. Callers asking at once share one load, and a failed load isn't kept. Never put anything
// user-specific in one: there is no key, so every caller gets the same value.

export interface MemoCache<T> {
  get(): Promise<T>;
  /** Drops the value, so the next get loads it again. */
  clear(): void;
}

export function memoCache<T>(ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): MemoCache<T> {
  let value: { data: T; at: number } | null = null;
  let loading: Promise<T> | null = null;
  // Bumped by clear, so a load that started before it can't store its older result afterwards.
  let generation = 0;

  return {
    get() {
      if (value && now() - value.at < ttlMs) return Promise.resolve(value.data);
      if (loading) return loading;
      const mine = generation;
      const started = now();
      const pending = load().then((data) => {
        if (generation === mine) value = { data, at: started };
        return data;
      });
      loading = pending;
      const done = () => {
        if (loading === pending) loading = null;
      };
      pending.then(done, done);
      return pending;
    },
    clear() {
      generation += 1;
      value = null;
      loading = null;
    },
  };
}
