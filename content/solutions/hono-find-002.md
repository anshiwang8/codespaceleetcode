# hono-find-002: The no-compose fast path

**Answer:** `src/hono-base.ts`, line 449, the `if` on `matchResult[0].length` inside `Hono.#dispatch`.

## Path
1. `Hono.fetch` and `Hono.request` both lead to `Hono.#dispatch`, so open that method.
2. After the router's `match` result is computed and a `Context` is created, search the method for `compose(`. It is called near the end of the method.
3. Just above it is an `if` on `matchResult[0].length`. The first element of the match result is the list of matched handlers, so `=== 1` means exactly one handler matched. In that branch the handler is called directly, with a `next` that sets the not-found response, and no composed chain is built.

## Why other lines are wrong
- The earlier `if (method === 'HEAD')` branch re-dispatches a HEAD request as GET. It does not decide whether to compose.
- The `compose(...)` call is the slow path. It runs only when the condition above is false.
