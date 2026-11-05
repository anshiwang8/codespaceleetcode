# hono-architecture-002: Routers that can ask SmartRouter to fall back

**Answer:**
- `src/router/linear-router/router.ts`
- `src/router/pattern-router/router.ts`
- `src/router/reg-exp-router/router.ts`

## What the puzzle is really asking

`SmartRouter` treats `UnsupportedPathError` as a signal: "this router cannot handle your routes, try the next one." Any router that can raise it is a router that can be skipped. The puzzle asks you to find every producer of that signal, as opposed to the class declaration and the one consumer.

## How to navigate there

1. **Find the declaration.** Search for `class UnsupportedPathError`. It lives in `src/router.ts`:

   ```ts
   // src/router.ts:103
   export class UnsupportedPathError extends Error {}
   ```

2. **List its references, then filter.** "Find references" (or a plain search for `UnsupportedPathError` under `src/router/`) gives a short list once you drop `*.test.ts` files. Each hit is one of three things: an `import`, a `throw new UnsupportedPathError`, or an `instanceof` check. Only the second kind counts.

3. **Check each router directory.** Every router lives in `src/router/<name>/router.ts`, with an `index.ts` that only re-exports it.

   ```text
   src/router/
     linear-router/   index.ts  router.ts                          throws (in match)
     pattern-router/  index.ts  router.ts                          throws (in add)
     reg-exp-router/  index.ts  router.ts  node.ts  trie.ts ...    router.ts throws, node.ts throws PATH_ERROR
     smart-router/    index.ts  router.ts                          catches only
     trie-router/     index.ts  router.ts  node.ts                 never throws it
   ```

4. **Watch for indirection in `reg-exp-router/`.** This is the only subtle one. The low-level code in `node.ts` never mentions `UnsupportedPathError`. It throws a private sentinel, `PATH_ERROR`, which is a `Symbol()` (`src/router/reg-exp-router/node.ts:6`). `router.ts` translates it at the boundary:

   ```ts
   // src/router/reg-exp-router/router.ts:60-66
   #insertPath(method: string, path: string) {
     try {
       this.#tries![method].insert(path, !/\*|\/:/.test(path))
     } catch (e) {
       throw e === PATH_ERROR ? new UnsupportedPathError(path) : e
     }
   }
   ```

   So the file that contains the `throw` of `UnsupportedPathError` is `router.ts`, not `node.ts` or `trie.ts`.

## The three throws

| File | Where | When it throws |
|---|---|---|
| `src/router/linear-router/router.ts` | `LinearRouter.match`, line 145 | A registered route has both a label (`:`) and a wildcard (`*`). Note this is in `match`, not `add`. |
| `src/router/pattern-router/router.ts` | `PatternRouter.add`, line 34 | `new RegExp(...)` for the route throws, and the `catch` rethrows it as `UnsupportedPathError`. |
| `src/router/reg-exp-router/router.ts` | `RegExpRouter.#insertPath`, line 64 | The trie insert threw the internal `PATH_ERROR`. |

The `LinearRouter` case is worth a second look:

```ts
// src/router/linear-router/router.ts:144-146
} else if (hasLabel && hasStar) {
  throw new UnsupportedPathError()
}
```

It still works with `SmartRouter` because `SmartRouter.match` calls both `router.add(...)` and `router.match(...)` inside the same `try` block (`src/router/smart-router/router.ts:34-44`). An error from either one triggers the fallback.

## Why the other candidates are wrong

- **`src/router.ts`** declares the class. The prompt excludes the declaring file, and it has no `throw` of the error.
- **`src/router/smart-router/router.ts`** imports it only to test `e instanceof UnsupportedPathError` and `continue`. It consumes the signal. It never raises it.
- **`src/router/reg-exp-router/node.ts`** throws, but it throws `PATH_ERROR`, a different value. Picking it means you followed the symptom instead of the exact type.
- **`src/router/reg-exp-router/trie.ts`** calls `Node.insert` and lets `PATH_ERROR` pass through. It has no `throw` statement at all.
- **`src/router/reg-exp-router/prepared-router.ts`** has one `throw`, but it is ``new Error(`Path ${path} is not registered`)``, a plain `Error`.
- **`src/router/trie-router/router.ts` and `node.ts`** have no `throw` of any kind. `TrieRouter` accepts every path, which is why it is the last-resort candidate in the default `SmartRouter` list.
- **Any `index.ts`** only re-exports a class.
- **Test files** such as `src/router/smart-router/router.test.ts` are excluded by the prompt.

## Background

Hono keeps several routers with different trade-offs. `RegExpRouter` is fast but strict about which patterns it can merge into one regex. `LinearRouter` registers instantly but scans routes one by one. `PatternRouter` is very small. `TrieRouter` is general. Using a shared error type lets `SmartRouter` combine them without knowing each router's internal rules. A router only has to say "no" in a standard way.

## Takeaways

- When asked "who raises X", separate declaration, producers and consumers. Find-references returns all three mixed together.
- Watch for sentinel values that are translated into a public error at a module boundary. The boundary file is the one that owns the public contract.
- Do not assume an error comes from the method you expect. `LinearRouter` raises it at match time, not at registration time.
