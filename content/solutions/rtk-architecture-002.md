# rtk-architecture-002: Default middleware order

**Answer:** option a, action-creator check, immutable-state check, thunk, serializable-state check.

## How to get there

Read `getDefaultMiddleware` (the function returned by `buildGetDefaultMiddleware` in `packages/toolkit/src/getDefaultMiddleware.ts`) and track the array through each step. With no options, every flag defaults to `true`, and the dev-only block runs because `NODE_ENV` is not `"production"`.

1. `middlewareArray = new Tuple()` is empty. `thunk` is on, so `push(thunkMiddleware)` gives `[thunk]`.
2. `immutableCheck` is on, so `unshift(createImmutableStateInvariantMiddleware(...))` puts it first: `[immutable, thunk]`.
3. `serializableCheck` is on, so `push(createSerializableStateInvariantMiddleware(...))` appends it: `[immutable, thunk, serializable]`.
4. `actionCreatorCheck` is on, so `unshift(createActionCreatorInvariantMiddleware(...))` puts it first: `[actionCreator, immutable, thunk, serializable]`.

## Why the others are wrong

- c: treats everything as pushed in the order the options are destructured.
- d: puts thunk before immutable, which would be true if the immutable middleware were pushed rather than unshifted.
- b: forgets that the action-creator check is unshifted after the others, so it ends up first and not last.
