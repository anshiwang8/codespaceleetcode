# rtk-find-002: Thunk condition returns false

**Answer:** lines 639-645 of `packages/toolkit/src/createAsyncThunk.ts`, the `if (conditionResult === false) { throw { name: 'ConditionError', ... } }` block.

## How to get there

1. Search `createAsyncThunk.ts` for `condition`. The option type and its docs are near the top, and the code that uses it is in the async IIFE inside the thunk returned by `actionCreator`.
2. There, `conditionResult = options?.condition?.(arg, { getState, extra })` is awaited if it is thenable. The next statement is the one asked for: `if (conditionResult === false) { throw {...} }`. The thrown value is an object literal, not an `Error`, which is why the prompt says "plain object".
3. Select from the `if` line to its closing brace.

## Why other selections are wrong

- The `rejected` action creator earlier in the file reads `error?.name === 'ConditionError'` to set `meta.condition`, but that only inspects the thrown value later.
- The next `if` (the abort-controller check, lines 646-657) throws an `AbortError`-named object when the signal is already aborted. It is a different guard.
- Selecting only the `throw` leaves the `if` line uncovered, and selecting the whole `try` body goes past the allowed window.
