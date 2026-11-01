# got-architecture-001: Retry-After versus backoff

**Answer:** option c, 2000 ms.

## How to get there

Trace the arguments through `calculateRetryDelay` in `source/core/calculate-retry-delay.ts`, for attempt 1:

1. The caller (`Request._beforeError` in `source/core/index.ts`) converts the `Retry-After: 2` header into `retryAfter = 2 * 1000 = 2000`, and passes `computedValue: retryOptions.maxRetryAfter ?? options.timeout.request ?? Infinity`. In the defaults (`options.ts`) `maxRetryAfter` and `timeout.request` are `undefined`, so `computedValue` is `Infinity`.
2. The error is not a `RetryError`, and `attemptCount` (1) is not above the default `limit` (2).
3. The method is GET (in the default `methods`), and 429 is in the default `statusCodes`, so the early `return 0` is skipped.
4. `error.response` is set and `retryAfter !== undefined`, so the function returns `retryAfter > computedValue ? 0 : Math.max(1, retryAfter)`. `2000 > Infinity` is false, so the result is `Math.max(1, 2000)`, which is 2000. The backoff and noise lines are never reached.

## Why the others are wrong

- a: The 0 branch needs `retryAfter > computedValue`, and `computedValue` is `Infinity` here.
- b: That is the value of the last line, which only runs when there is no `retryAfter` (and the status is not 413).
- d: The 1 ms minimum comes from `Math.max(1, ...)` only when the computed value would otherwise be below 1, which does not apply.
