# hono-architecture-002: Routers that can ask SmartRouter to fall back

**Answer:**
- `src/router/linear-router/router.ts`
- `src/router/pattern-router/router.ts`
- `src/router/reg-exp-router/router.ts`

## Path
1. The error class is declared in `src/router.ts`. Find its references and filter out tests.
2. `src/router/smart-router/router.ts` only catches the error (`e instanceof UnsupportedPathError`), so it does not count.
3. `LinearRouter.match` throws it when a route has both a label and a wildcard. `PatternRouter.add` throws it when building the route's `RegExp` fails. `RegExpRouter.#insertPath` converts the internal `PATH_ERROR` into an `UnsupportedPathError`.
4. `TrieRouter` never throws it, and the other files in `src/router/reg-exp-router/` (`node.ts`, `trie.ts`, `prepared-router.ts`) only use the internal `PATH_ERROR` symbol or do not raise it at all.

## Why the others are wrong
- `src/router.ts` declares the class but never throws it.
- `src/router/smart-router/router.ts` catches it.
- `src/router/trie-router/router.ts` and `node.ts` have no `throw` of it.
