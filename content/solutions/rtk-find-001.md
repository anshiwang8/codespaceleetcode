# rtk-find-001: Detecting a state mutation

**Answer:** `packages/toolkit/src/immutableStateInvariantMiddleware.ts#detectMutations`

## How to get there

1. The immutability check lives in `packages/toolkit/src/immutableStateInvariantMiddleware.ts` (`createImmutableStateInvariantMiddleware` is its public entry point, and `getDefaultMiddleware.ts` wires it in during development).
2. In that file `trackForMutations` calls `trackProperties` once to build the snapshot (`{value, children}` nodes), and returns an object with a `detectMutations()` method that calls the top-level `detectMutations(isImmutable, ignoredPaths, trackedProperties, obj)`.
3. The top-level `detectMutations` is the recursive comparer: it gathers keys from both the tracked children and the current object, recurses into each, and returns `{ wasMutated: true, path }` as soon as it finds a reference that changed under an unchanged parent.

## Why other candidates are wrong

- `trackProperties` is the function that builds the snapshot. The prompt asks for the one that compares.
- `trackForMutations` creates the tracker and delegates both steps, so it holds no comparison logic.
- `isImmutableDefault` only decides whether a single value can be skipped (primitives, `null`, frozen objects).
- `createImmutableStateInvariantMiddleware` calls the tracker around each dispatch and throws the error. It is the middleware, not the comparison.
