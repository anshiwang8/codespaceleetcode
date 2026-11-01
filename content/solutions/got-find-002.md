# got-find-002: Default retryable status codes

**Answer:** `source/core/options.ts`, lines 1378-1389, the `statusCodes: [ 408, 413, ... 524 ]` array inside the `retry` object of the defaults.

## How to get there

1. In `source/core/options.ts`, search for `statusCodes` or `retry:`. The long doc comments and the `RetryOptions` type declarations mention the name, but only one place assigns a numeric array: the defaults object (`defaultInternals`) near line 1367.
2. Inside `retry: { limit: 2, methods: [...], statusCodes: [...], errorCodes: [...] ... }` the array of numbers is `statusCodes`. Select from the `statusCodes: [` line through the closing `],`.

## Why other selections are wrong

- `methods` (above it) lists HTTP methods and `errorCodes` (below it) lists system error code strings such as `ETIMEDOUT`. Neither holds status codes.
- A selection of the whole `retry` object would span more than the 30 line limit, so it cannot be accepted. A selection that stops before the closing line misses part of the anchor.
- `calculateRetryDelay` in `calculate-retry-delay.ts` reads this list (`retryOptions.statusCodes.includes(...)`) but does not define the default.
