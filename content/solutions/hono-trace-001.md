# hono-trace-001: From app.request to the middleware chain

**Answer:** `Hono.request` -> `Hono.fetch` -> `Hono.#dispatch` -> `compose`

## Path
1. Start at `Hono.request` in `src/hono-base.ts`. With a string input it builds a `new Request(...)` (a platform call, skipped) and passes it to `this.fetch(...)`.
2. `Hono.fetch` is a one-liner that calls `this.#dispatch(request, rest[1], rest[0], request.method)`.
3. `Hono.#dispatch` matches the route with the router and builds a `Context`. When more than one handler matched, it skips the single-handler fast path and calls `compose(matchResult[0], this.errorHandler, this.#notFoundHandler)`.
4. `compose` in `src/compose.ts` is the middleware composer, so the trace ends there.

## Why other candidates are wrong
- `Router.match` and `Context`'s constructor are also called from `Hono.#dispatch`, but neither chains handlers. `Router.match` is an interface method and `new Context` is a constructor, both excluded by the prompt.
- `mergePath` is called directly from `Hono.request`, but it only builds the URL and never leads to `compose`.
- `Hono.route` also calls `compose` directly, but it is not reachable from `Hono.request`.
