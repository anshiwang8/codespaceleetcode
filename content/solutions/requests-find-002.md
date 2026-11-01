# requests-find-002: Dropping the body on a redirect

**Answer:** `src/requests/sessions.py`, lines 250-258 (the `if resp.status_code not in (codes.temporary_redirect, codes.permanent_redirect):` block in `SessionRedirectMixin.resolve_redirects`).

## How to find it

1. Start from `Session.send`, which calls `resolve_redirects` when `allow_redirects` is true.
2. Inside the `while url:` loop, each iteration copies the request (`req.copy()`), updates the URL, calls `rebuild_method`, and then adjusts the copy.
3. Search the function for `body` or `Content-Length`. The only place that sets `prepared_request.body = None` is this block: it pops `Content-Length`, `Content-Type` and `Transfer-Encoding` and clears the body.
4. The guard is `resp.status_code not in (codes.temporary_redirect, codes.permanent_redirect)`, i.e. everything except 307 and 308.

## Why nearby code is wrong

- `rebuild_method` (called just before) may change the HTTP method (for example POST to GET on 303) but doesn't touch the body.
- The `headers.pop("Cookie", None)` line right after the block removes the cookie header so it can be rebuilt, which is a different concern.
- The rewind logic (`rewind_body`) re-reads a file-like body for requests that keep their body, and is further down.
