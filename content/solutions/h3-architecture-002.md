# h3-architecture-002: Middleware that returns undefined

**Answer:** option b. The framework calls `next()` on the middleware's behalf.

## How to get there

1. `use()` in `src/h3.ts` pushes the middleware (after `normalizeMiddleware`) into `"~middleware"`, and `createDispatcher` composes the list with `composeMiddleware`, which builds each layer out of `callLayer`.
2. In `callLayer` (`src/middleware.ts`), the middleware is invoked as `const ret = fn(event, next);`. The next line is `isUnhandledResponse(ret) ? next() : ...`.
3. `isUnhandledResponse` returns true when the value is `undefined` or `kNotFound`. So a middleware that returns `undefined` without calling `next()` makes `callLayer` call `next()` itself, and the next layer (or the terminal route handler) runs.
4. `normalizeMiddleware` does the same thing for non-async functions with a matcher or fewer than two parameters: it wraps them so `undefined` or `kNotFound` results in `next()`.

## Why the other options are wrong

- a: nothing in `callLayer` turns `undefined` into an empty 200. An empty 200 happens later, in `prepareResponseBody`, only if the whole chain eventually yields `null` or `undefined`.
- c: there is no check that `next` was invoked. `next` is memoized with `nextCalled`, so calling it late is safe, and no error is thrown.
- d: a 404 only appears if the chain reaches `NoHandler` (no matching route) and the final value is `kNotFound`. It is not produced by the middleware returning `undefined`.
