# httpx-find-002: Dropping credentials on cross-origin redirects

**Answer:** `httpx/_client.py`, lines 553-556 in `BaseClient._redirect_headers`.

## How to find it

1. Open `BaseClient._redirect_headers`. It copies the request headers, then handles three concerns in order: origin change, method change to GET, and cookies.
2. The origin-change block begins with `if not _same_origin(url, request.url):`. Inside it, the nested `if not _is_https_redirect(request.url, url):` guards `headers.pop("Authorization", None)`. That nested `if` (line 553) through the `pop` (line 556), including the two comment lines in between, is the answer.

## Why nearby code is wrong

- Line 552 is the outer origin check; selecting from there would include the Host header update at 559, which is a separate statement.
- Line 559 (`headers["Host"] = ...`) is inside the outer `if` but not part of the Authorization exception.
- Lines 561-565 strip body-related headers when the method became GET, a different condition.
- Line 569 removes `Cookie` so the client's cookie jar is used.
