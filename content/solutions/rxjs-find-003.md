# rxjs-find-003: Completing a throttle after its trailing value

**Answer:** `packages/rxjs/src/throttle.ts`, lines 41 to 43: the `if (sourceComplete) { subscriber.complete(); }` inside `endThrottling`.

## Path
1. With `{ trailing: true }`, the defaults give `leading = true` and `restartOnTrailing = true`.
2. First value: no `innerController`, `leading` is true, so `send()` emits it and calls `startThrottle(value)`. With a numeric `delay`, `startThrottle` sets `innerController` and starts `setTimeout(() => endThrottling(controller), delay)`.
3. Second value: `hasValue = true` and `sendValue` is stored, but `innerController` is set, so nothing is emitted.
4. Source completes: the `complete` handler sets `sourceComplete = true`. Its condition `!(trailing && hasValue && innerController)` is false, so it does not complete the subscriber.
5. The timer fires and calls `endThrottling(controller)`. It clears `innerController`, then because `trailing` is true calls `send(restartOnTrailing)`, which emits the stored value. `send` does not restart the throttle because `sourceComplete` is true. Back in `endThrottling`, `if (sourceComplete) { subscriber.complete(); }` on lines 41 to 43 completes the output.

## Why other lines are wrong
- Lines 107 to 109, in the source's `complete` handler, complete the subscriber only when there is no pending trailing value or no open window. In this scenario the condition is false.
- Lines 51 to 53, in `cleanupThrottling`, run only when a duration observable completes without emitting. A numeric `delay` uses `setTimeout`, never `cleanupThrottling`.
- Lines 38 to 40 send the trailing value but do not complete anything.
