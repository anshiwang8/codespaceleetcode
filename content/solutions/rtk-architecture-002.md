# rtk-architecture-002: Default middleware order

**Answer:** option a, action-creator check, immutable-state check, thunk, serializable-state check.

## Where to look

`getDefaultMiddleware` is an inner function returned by `buildGetDefaultMiddleware` in `packages/toolkit/src/getDefaultMiddleware.ts` (line 53-54). `configureStore` calls `buildGetDefaultMiddleware<S>()` once and then either passes the result to your `middleware` callback or calls it directly when you supply none (`configureStore.ts:130`, `:163`, `:174`).

The order is not written down anywhere as a list. You have to simulate the array, because the code mixes `push` and `unshift`.

## Defaults

With no options, every flag defaults to `true`:

```ts
// packages/toolkit/src/getDefaultMiddleware.ts:55-60
const {
  thunk = true,
  immutableCheck = true,
  serializableCheck = true,
  actionCreatorCheck = true,
} = options ?? {}
```

The three checks are inside `if (process.env.NODE_ENV !== 'production')` (line 72). The prompt says we are not in production, so that block runs.

## Simulating the array

The array starts as `new Tuple<Middleware[]>()` (line 62). `Tuple` extends `Array` and does not override `push` or `unshift`, so they behave like normal array methods.

| Step | Line | Call | Array after the call |
|---|---|---|---|
| 1 | 66 | `push(thunkMiddleware)` | `[thunk]` |
| 2 | 81 | `unshift(createImmutableStateInvariantMiddleware(...))` | `[immutable, thunk]` |
| 3 | 95 | `push(createSerializableStateInvariantMiddleware(...))` | `[immutable, thunk, serializable]` |
| 4 | 106 | `unshift(createActionCreatorInvariantMiddleware(...))` | `[actionCreator, immutable, thunk, serializable]` |

`thunk` is the boolean `true`, so `isBoolean(thunk)` holds and the plain `thunkMiddleware` is pushed, not `withExtraArgument(...)`. That doesn't change the position.

```text
start           [ ]
push thunk      [ thunk ]
unshift immut.  [ immutable, thunk ]
push serial.    [ immutable, thunk, serializable ]
unshift action  [ actionCreator, immutable, thunk, serializable ]
                  ^ index 0
```

## What the order means at runtime

In Redux, the first middleware in the array is the outermost one. It sees every dispatched value first. With this order:

- The **action-creator check** (`actionCreatorInvariantMiddleware.ts:28-33`) calls `console.warn` when the dispatched value is an RTK action creator, i.e. `dispatch(increment)` instead of `dispatch(increment())`. Sitting before thunk matters: an action creator is a function, and thunk would otherwise call it as if it were a thunk.
- The **immutable-state check** wraps everything else, including thunks, so it can detect mutations that happen anywhere during a dispatch.
- The **serializable check** comes after thunk, so it only sees real action objects, not thunk functions.

## Why the other options are wrong

- **b (immutable, thunk, serializable, action-creator)** is the order you get if you forget that the action-creator check is added with `unshift`. That call runs last, so it puts its middleware at index 0, not at the end.
- **c (thunk, immutable, serializable, action-creator)** treats every call as a `push` in source order. It ignores both `unshift` calls.
- **d (action-creator, thunk, immutable, serializable)** gets the action-creator check right but treats the immutable check as a `push`. Because it is unshifted, it ends up ahead of thunk.

## Takeaways

- When a list is built with a mix of `push` and `unshift`, write the array out after each call. Reading the source top to bottom gives the wrong order.
- Environment guards (`NODE_ENV !== 'production'`) change which branches run. Check the prompt's assumptions before simulating.
