# httpx-find-002: Dropping credentials on cross-origin redirects

**Answer:** `httpx/_client.py` lines 553-556, the inner `if not _is_https_redirect(request.url, url):` statement through `headers.pop("Authorization", None)`, inside `BaseClient._redirect_headers`.

```python
# httpx/_client.py:552-559
        if not _same_origin(url, request.url):
            if not _is_https_redirect(request.url, url):
                # Strip Authorization headers when responses are redirected
                # away from the origin. (Except for direct HTTP to HTTPS redirects.)
                headers.pop("Authorization", None)

            # Update the Host header.
            headers["Host"] = url.netloc.decode("ascii")
```

Lines 553 to 556 must all be selected (the two comment lines are part of the `if` body's span). The selection must stay within lines 550-560, so including the outer `if` on line 552 is still accepted.

## How to navigate there

1. Jump to `BaseClient._redirect_headers` (line 546). It's 25 lines long and makes three independent adjustments to a copy of the request headers:

```text
_redirect_headers(request, url, method)          line 546
  550  headers = Headers(request.headers)
  552  if not _same_origin(url, request.url):          origin changed
  553      if not _is_https_redirect(...):              <-- answer starts
  556          headers.pop("Authorization", None)       <-- answer ends
  559      headers["Host"] = url.netloc...
  561  if method != request.method and method == "GET":  body headers
  564-565    pop Content-Length, Transfer-Encoding
  569  headers.pop("Cookie", None)                     always
  571  return headers
```

2. The hint says the statement is "nested inside the origin comparison". There's only one nested `if` in the method, on line 553.
3. Check both helpers to confirm the condition means what the prompt says.

## The two helpers

`_same_origin` (line 83) compares scheme, host and port, with default ports filled in:

```python
# httpx/_client.py:87-91
    return (
        url.scheme == other.scheme
        and url.host == other.host
        and _port_or_default(url) == _port_or_default(other)
    )
```

`_is_https_redirect` (line 62) recognizes exactly one safe cross-origin move: same host, from `http` on port 80 to `https` on port 443.

```python
# httpx/_client.py:66-74
    if url.host != location.host:
        return False

    return (
        url.scheme == "http"
        and _port_or_default(url) == 80
        and location.scheme == "https"
        and _port_or_default(location) == 443
    )
```

| Redirect | `_same_origin` | `_is_https_redirect` | `Authorization` |
|---|---|---|---|
| `https://a.com/x` to `https://a.com/y` | true | not checked | kept |
| `http://a.com` to `https://a.com` | false | true | kept |
| `https://a.com` to `https://b.com` | false | false | **removed** |
| `https://a.com` to `http://a.com` (downgrade) | false | false | **removed** |
| `http://a.com:8080` to `https://a.com` | false | false (port isn't 80) | **removed** |

## Why the exception exists

Sending credentials to a different host would leak them to a server the user didn't choose, so a cross-origin redirect normally drops them. An `http` to `https` upgrade on the same host is common (servers redirect plain HTTP to HTTPS) and moves the request to a *more* secure channel on the same server, so keeping the credentials is safe. The check is strict: only default ports and only that direction count. A downgrade from `https` to `http` strips the header.

## Why the nearby code is wrong

- **Line 552** (the outer `if not _same_origin(...)`). It is the origin comparison the prompt says the answer is nested inside. Selecting from 552 is allowed, but the outer `if` alone doesn't cover the anchor.
- **Lines 558-559** (`headers["Host"] = ...`). Inside the outer `if`, but a separate statement: the `Host` header is updated for *every* cross-origin redirect, including the https upgrade.
- **Lines 561-565.** A different condition: the method switched to GET, so the body headers are removed.
- **Line 569** (`headers.pop("Cookie", None)`). Runs for every redirect, so the client's cookie jar decides cookies for the new URL.
- **Only line 556.** It is the removal, but without its `if` line it doesn't cover the anchor, and it hides the exception the prompt asks about.
- **`_is_https_redirect` itself** (lines 62-74). It computes the condition but doesn't remove anything, and it isn't inside `_redirect_headers`.

## Takeaways

- Security-related header handling on redirects tends to follow the same pattern across HTTP clients: compare origins, strip credentials if they differ, allow a narrow set of safe exceptions. Look for an "origin" helper.
- When a condition calls a small helper (`_is_https_redirect`), read the helper before assuming what it accepts. Here the port requirement makes the exception much narrower than its name suggests.
- Drawing a small table of input cases is a quick way to check you understand nested conditions.
