# hono-trace-002: From c.redirect to the response builder

**Answer:** `Context.redirect` -> `Context.newResponse` -> `Context.#newResponse`

## Path
1. Open `src/context.ts` and find `redirect`. It is an arrow-function property, not a method. It first calls `this.header('Location', ...)` to record the `Location` header, then returns `this.newResponse(null, status ?? 302)`.
2. `newResponse` is the public one-line property `(...args) => this.#newResponse(...args)`. It does nothing but forward to the private method.
3. `#newResponse` merges the headers prepared so far (`this.#res`'s headers or `this.#preparedHeaders`) with any headers passed in, picks the status (`302` here), and builds the `Response` through `createResponseInstance`. That is the end of the chain.

## Why other candidates are wrong
- `Context.header` is also called from `redirect`, but it only stores the `Location` header. It never reaches `#newResponse`, so no chain through it ends there.
- Going straight from `redirect` to `#newResponse` skips a step: `redirect` calls the public `newResponse` wrapper, not the private method. Each entry must be called from the body of the previous one.
- `createResponseInstance` is the module-level helper that `#newResponse` calls to construct the `Response`. It is not a `Context` method, and the chain stops at `#newResponse`.
- `Context.body`, `Context.text` and `Context.json` also call `#newResponse`, but `redirect` never calls them.
