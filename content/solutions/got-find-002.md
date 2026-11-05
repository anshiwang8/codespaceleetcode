# got-find-002: Default retryable status codes

**Answer:** `source/core/options.ts`, lines 1378-1389, the `statusCodes: [ 408, 413, ... 524 ]` array inside the `retry` object of the defaults.

## How a strong engineer would navigate there

`options.ts` is a very large file (well over 3,000 lines), so scrolling isn't practical. Search it for `statusCodes`. You get about a dozen hits, and they sort into kinds:

| Line(s) | Kind | Assigns the default? |
|---|---|---|
| 631, 640, 3136, 3147 | doc comments | no |
| 661 | `statusCodes: number[]` in the `RetryOptions` type | no |
| **1378** | **inside `defaultInternals`** | **yes** |
| 1515 | `cloneInternals` copies the array with `[...retry.statusCodes!]` | no |
| 1557-1558 | copies a user-supplied array | no |
| 3180, 3188 | validation in the `retry` setter | no |
| 3213 | de-duplicates with `new Set` | no |
| 3681 | `Object.freeze(options.retry.statusCodes)` | no |

Only line 1378 opens an array of number literals. It is inside `const defaultInternals: InternalsType = {` (line 1312), the object of default option values, which is what the hint means by "the defaults object".

## The lines

```ts
// source/core/options.ts:1367-1389
retry: {
	limit: 2,
	methods: [
		'GET',
		...
		'QUERY',
	],
	statusCodes: [
		408,
		413,
		429,
		500,
		502,
		503,
		504,
		521,
		522,
		524,
	],
```

Select from the `statusCodes: [` line (1378) through the closing `],` (1389). The grader requires all of 1378-1389, and the selection must stay inside 1372-1401.

```text
retry: {                         1367
  limit: 2,                      1368
  methods: [ ...strings ],       1369-1377
  statusCodes: [ ...numbers ],   1378-1389   <-- answer
  errorCodes: [ ...strings ],    1390-1399
  maxRetryAfter: undefined,      1400
  calculateDelay: ...,           1401
  backoffLimit: Infinity,        1402
  noise: 100,                    1403
  enforceRetryRules: true,       1404
},                               1405
```

## What the codes mean

| Code | Meaning |
|---|---|
| 408 | Request Timeout |
| 413 | Content Too Large |
| 429 | Too Many Requests |
| 500, 502, 503, 504 | Internal Server Error, Bad Gateway, Service Unavailable, Gateway Timeout |
| 521, 522, 524 | Cloudflare-specific: web server down, connection timed out, a timeout occurred |

They are all transient conditions where trying again later can reasonably succeed. 413 is a special case: got's built-in retry delay only allows a retry for it when the server sends `Retry-After`, and is 0 (no retry) otherwise.

## Why other selections are wrong

- **`methods` (lines 1369-1377)** lists HTTP method strings, not status codes.
- **`errorCodes` (lines 1390-1399)** lists Node.js system error codes such as `'ETIMEDOUT'` and `'ECONNRESET'`. These apply when there is no response at all.
- **The whole `retry` object (1367-1405)** starts before the window and includes much more than the status codes.
- **Stopping at line 1388 (`524,`)** leaves the closing `],` uncovered.
- **Line 661 in the `RetryOptions` type** declares the field's type, not its value.
- **The copies and normalisation at lines 1515, 1558 and 3213** operate on whatever array is already there. None of them defines the default list.
- **`calculate-retry-delay.ts:22`** reads the list with `retryOptions.statusCodes.includes(...)`. It uses the default but doesn't define it, and it is in another file.

## Takeaways

- In a large options file, the same key appears in the type, the defaults, the cloner, the setter and the docs. Classify the hits before opening any of them.
- Default values usually live in one object literal near the top or middle of an options module. Once you find it, every default is in one place.
