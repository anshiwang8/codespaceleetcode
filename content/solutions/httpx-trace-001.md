# httpx-trace-001: From Client.send to the redirect request headers

**Answer:** `Client.send` -> `Client._send_handling_auth` -> `Client._send_handling_redirects` -> `BaseClient._build_redirect_request` -> `BaseClient._redirect_headers`

## How to find it

1. `Client.send` checks the client state, applies `_set_timeout` and `_build_request_auth`, then calls `self._send_handling_auth(request, auth=auth, follow_redirects=..., history=[])`.
2. `_send_handling_auth` drives the auth flow generator and calls `self._send_handling_redirects(request, follow_redirects=..., history=history)` in a loop.
3. `_send_handling_redirects` calls `_send_single_request`, runs the response hooks, and when `response.has_redirect_location` is true it calls `self._build_redirect_request(request, response)`.
4. `_build_redirect_request` (in `BaseClient`) calls `_redirect_method`, `_redirect_url`, `_redirect_headers` and `_redirect_stream`. The one that computes headers is `_redirect_headers`.

## Why the alternatives are wrong

- `_send_single_request` is also called from `_send_handling_redirects`, but it sends the request and has no link to header computation.
- `_redirect_method`, `_redirect_url` and `_redirect_stream` are siblings of `_redirect_headers`, called by the same method.
- `AsyncClient.send` and its async counterparts mirror the same chain but are in the other class, excluded by the prompt.
