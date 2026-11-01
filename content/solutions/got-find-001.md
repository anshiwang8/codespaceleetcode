# got-find-001: Exponential retry backoff

**Answer:** `source/core/calculate-retry-delay.ts#calculateRetryDelay`

## How to get there

1. Search `source/core/` for `backoffLimit`. Outside of option declarations and docs in `options.ts`, it is read in only one expression: `Math.min((2 ** (attemptCount - 1)) * 1000, retryOptions.backoffLimit) + noise`, in `calculate-retry-delay.ts`.
2. That file holds a single arrow function assigned to the constant `calculateRetryDelay`. It returns `0` in several early-exit cases (attempt count above `limit`, method or status/error code not retryable, a 413 response) and the backoff otherwise.
3. Find References on it: `Request._beforeError` in `source/core/index.ts` calls it and then hands the result to `retryOptions.calculateDelay` as `computedValue`.

## Why other candidates are wrong

- The default `calculateDelay: ({computedValue}) => computedValue` in `options.ts` (the defaults object) just passes the computed value through. It does no backoff math and is not an indexed symbol.
- `Request._beforeError` decides whether to retry and waits with `setTimeout`, but it delegates the delay computation.
- The `retry` setter in `Options` only validates the user's retry settings.
