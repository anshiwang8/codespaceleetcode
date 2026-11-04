# h3-architecture-004: A route added after mount

**Answer:** option a. The child's middleware runs, then the parent answers 404.

## How to get there
1. Open `mount` in `src/h3.ts` (inside the `H3` class). It branches on `"handler" in input`. An `H3` instance has a `handler` (defined on `H3Core` and bound as an own property in its constructor), so the child takes the first branch. The `else` branch, which registers a `/**` catch-all that calls `fetchHandler(...)`, is only for plain fetch functions and objects with a `fetch` method.
2. In the first branch, two things happen, both at the moment `mount` is called:
   - Because `child["~middleware"]` already holds the logger (from `child.use`), the parent pushes one wrapper middleware of its own. On each request under `/api` it strips the base from `event.url.pathname`, runs the child's composed middleware (`input["~composed"] ??= composeMiddleware(input["~middleware"])`), and ends that chain by restoring the path and calling the parent's `next()`.
   - It loops over `input["~routes"]` and calls `this["~addRoute"]` with a copy of each route, prefixed with the base. At this point the child only has `/early`, so the parent's rou3 router gets `/api/early` and nothing else.
3. `child.get("/late", ...)` runs after the mount. It goes through `on` and `"~addRoute"` on the child, so it updates only the child's own router and `~routes` array. Nothing links them back to the parent.
4. For the request, `parent.fetch` calls `"~request"` and then `handler`. `"~findRoute"` asks the parent's rou3 router for `GET /api/late` and gets no match (it is not a HEAD request, so there is no GET fallback). `createDispatcher` composes the parent's one middleware, and `routeHandler(undefined)` returns `NoHandler`.
5. The wrapper sees that the path starts with `/api/`, so it runs the child's chain. The logger is wrapped by `normalizeMiddleware`, returns `undefined`, and so calls `next()`. That reaches the terminal handler, which restores the path and calls the parent's `next()`, so `NoHandler` returns `kNotFound`. `callLayer` passes `kNotFound` along (an unhandled result just triggers the memoized `next`), and `prepareResponse` in `src/response.ts` turns `kNotFound` into an `HTTPError` with status 404.

## Why the others are wrong
- b: forwarding to the child's `fetch` is the `else` branch of `mount`. It applies only to inputs without a `handler`, not to an `H3` app.
- c: the wrapper the parent adds checks only the path prefix. It runs for every request under `/api`, whether or not the parent's router matched a route, so the logger does run.
- d: `mount` reads `input["~routes"]` once, in a loop that copies each route into the parent's router. The parent never looks at the child's array again.
