# hono-architecture-001: Where the default app ends up after a fallback

**Answer:** d, `TrieRouter`

## Path
1. `src/hono.ts` gives `SmartRouter` the list `[RegExpRouter, TrieRouter]`.
2. `SmartRouter.match` (`src/router/smart-router/router.ts`) replays every registered route into the first candidate with `router.add(...)`. If that throws `UnsupportedPathError` it moves on to the next candidate. Once a candidate succeeds it rebinds `this.match = router.match.bind(router)` and drops the other routers, so later requests go straight to that candidate.
3. Does `RegExpRouter` accept `/files/:path{.*}`? `RegExpRouter.add` calls `#insertPath`, which calls `Trie.insert` in `src/router/reg-exp-router/trie.ts`. The path contains `/:`, so it is a dynamic path and is tokenized with `:path{.*}` as one token. `Node.insert` in `src/router/reg-exp-router/node.ts` sees a named parameter whose custom pattern is exactly `.*` and throws `PATH_ERROR`. `#insertPath` converts that to `UnsupportedPathError`.
4. `SmartRouter` catches it and tries `TrieRouter`. `TrieRouter.add` never throws that error, so it succeeds and becomes the only router.

## Why the others are wrong
- `RegExpRouter` is tried first, but it rejects this path.
- `LinearRouter` and `PatternRouter` are not in the default `src/hono.ts` list. They appear only in the `quick` and `tiny` presets.
- `SmartRouter`'s own `match` is replaced by the chosen router's bound `match` after the first successful request.
