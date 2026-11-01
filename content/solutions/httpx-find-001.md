# httpx-find-001: Changing the method on redirect

**Answer:** `httpx/_client.py#BaseClient._redirect_method`

## How to find it

1. Search `httpx/_client.py` for `redirect`. `BaseClient` has a family of helpers: `_build_redirect_request`, `_redirect_method`, `_redirect_url`, `_redirect_headers`, `_redirect_stream`.
2. `_build_redirect_request` shows how they divide the work: `method = self._redirect_method(request, response)`, `url = self._redirect_url(...)`, `headers = ...`, `stream = ...`.
3. `_redirect_method` compares `response.status_code` against `codes.SEE_OTHER`, `codes.FOUND` and `codes.MOVED_PERMANENTLY` and rewrites the method to `"GET"` (never for HEAD, and 301 only for POST).

## Why the others are wrong

- `_redirect_url` resolves the `Location` header into a URL.
- `_redirect_headers` strips or updates headers (Authorization, Host, Content-Length, Cookie) and receives the already-chosen method as a parameter.
- `_redirect_stream` decides whether the request body is kept, again based on the already-chosen method.
- `_build_redirect_request` orchestrates them, it doesn't contain the status-code logic.
