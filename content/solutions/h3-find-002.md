# h3-find-002: Request smuggling guard

**Answer:** `src/utils/body.ts#assertBodySize`

## How to get there

1. Search `src/utils/` for `transfer-encoding` (case-insensitive). Only two files match as code: `src/utils/body.ts` and `src/utils/proxy.ts` / `src/utils/internal/proxy.ts`.
2. In the proxy files the header name only appears in lists of hop-by-hop headers to drop. Nothing there throws a 400.
3. In `src/utils/body.ts`, `assertBodySize` reads `content-length`, and inside that branch it checks `req.headers.get("transfer-encoding")` and throws `new HTTPError({ status: 400 })`. That is the check.

## Why other candidates are wrong

- `bodyLimit` in `src/utils/middleware.ts` only calls `assertBodySize(event, limit)` and then `next()`. It contains no header check itself.
- `bodyTooLargeError` in `src/utils/body.ts` builds the 413 error for an oversized body. It is a helper and never looks at headers.
- `readBody` parses the body after the fact and never checks `Transfer-Encoding`.
- The proxy helpers mention `transfer-encoding` only to strip it from forwarded headers.
