# hono-find-003: First router tried by the default app

**Answer:** `src/router/reg-exp-router/router.ts` (defines `RegExpRouter`)

## Path
1. Open `src/hono.ts`. The `Hono` constructor sets `this.router` to a `SmartRouter` whose `routers` array lists `RegExpRouter` first and `TrieRouter` second.
2. Open `src/router/smart-router/router.ts` and read `SmartRouter.match`. It loops over `this.#routers` from index 0, adds every registered route to the candidate, and moves to the next candidate only when it catches an `UnsupportedPathError`. So index 0 is tried first.
3. Index 0 is `RegExpRouter`. Go to its definition: it is in `src/router/reg-exp-router/router.ts`.

## Why the others are wrong
- `src/router/reg-exp-router/index.ts` only re-exports the class.
- `src/router/trie-router/router.ts` defines the fallback router, which is second in the array.
- `src/preset/quick.ts` builds a different list with `LinearRouter` first, but the prompt points at `src/hono.ts`.
