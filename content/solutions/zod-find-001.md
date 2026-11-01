# zod-find-001: Building the failure result of safeParse

**Answer:** `packages/zod/src/v4/core/parse.ts#failure`

## Path
1. Open `packages/zod/src/v4/core/parse.ts` and read `_safeParse`. It runs `schema._zod.run(...)` and returns either `{ success: true, data }` or, when `result.issues.length` is non-zero, `failure(_Err, result.issues, ctx)`.
2. Jump to `failure`. It returns an object with `success: false` and a getter for `error`. The getter creates the error instance (`new Err(issues.map(...finalizeIssue...))`) on the first read and caches it, so a caller that only checks `success` never pays for building the error.

## Why the others are wrong
- `_safeParseAsync` has its own call to `failure`, but it is the async twin and does not define it.
- `finalizeIssue` (in `util.ts`) is called inside the getter to shape each issue. It does not build the result object.
- `packages/resolution/src/` also has constants named `failure`. They are in another package and have nothing to do with `_safeParse`.
