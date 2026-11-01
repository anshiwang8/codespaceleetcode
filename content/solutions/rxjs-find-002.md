# rxjs-find-002: Which AbortSignal the upstream subscription uses

**Answer:** `packages/rxjs/src/util/observable-helpers.ts`, line 38: `{ signal: signal ? AbortSignal.any([subscriber.signal, signal]) : subscriber.signal }`.

## Path
1. Open `subscribeToSource`. After the `guard` and `handleError` setup, a `try` block calls `source.subscribe(observer, options)`.
2. The second argument is the options object on line 38. It uses a ternary on the optional `signal` parameter: with one, `AbortSignal.any([subscriber.signal, signal])` aborts when either aborts. Without one, it passes `subscriber.signal`.
3. That single line is the anchor. The observer object above it (lines 33 to 37) wires the handlers, not the signal.

## Why other lines are wrong
- Lines 33 to 37 build the `next`, `error` and `complete` observer. They do not choose a signal.
- The `catch` block below it handles an exception thrown while subscribing.
