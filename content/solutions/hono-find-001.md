# hono-find-001: The strict-routing switch

**Answer:** `src/utils/url.ts#getPathNoStrict`

## Path
1. Open `src/hono-base.ts` and find the `Hono` constructor. Its last statement assigns `this.getPath` with a ternary on `strict ?? true`.
2. The "true" branch uses `options.getPath ?? getPath`. The "false" branch uses `getPathNoStrict`. Jump to its definition in `src/utils/url.ts`.
3. `getPathNoStrict` calls `getPath` and then strips a single trailing `/` from any path longer than one character, so `/hello/` and `/hello` reach the router as the same path.

## Why the others are wrong
- `getPath` (same file) is the strict variant, used when `strict` is `true` (the default) and no custom `getPath` is given.
- `mergePath` joins base paths when routes are registered. It does not choose how a request path is read.
