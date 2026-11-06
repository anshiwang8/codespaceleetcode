# requests-find-002: Dropping the body on a redirect

**Answer:** `src/requests/sessions.py` lines 250-258, the `if resp.status_code not in (codes.temporary_redirect, codes.permanent_redirect):` block inside `SessionRedirectMixin.resolve_redirects`.

```python
# src/requests/sessions.py:250-258
            if resp.status_code not in (
                codes.temporary_redirect,
                codes.permanent_redirect,
            ):
                # https://github.com/psf/requests/issues/3490
                purged_headers = ("Content-Length", "Content-Type", "Transfer-Encoding")
                for header in purged_headers:
                    prepared_request.headers.pop(header, None)
                prepared_request.body = None
```

The grader needs every line from 250 to 258 selected. Including the issue-link comment on line 249, or a line or two after, is still accepted, as long as the selection stays within lines 246-262.

## How to navigate there

1. **Get into the redirect loop.** `resolve_redirects` starts at line 186. You can reach it from `Session.send`, which calls `self.resolve_redirects(r, request, **kwargs)` when `allow_redirects` is true (line 804). The work happens inside `while url:` (line 204), one iteration per redirect hop.
2. **Search for the body.** Within the function, search for `body` or `Content-Length`. The only assignment `prepared_request.body = None` is on line 258. Scroll up to the enclosing `if` to get the start of the block.
3. **Check the condition against the prompt.** The prompt says the body is dropped "only when the redirect's status code is not one of the two codes that must preserve the method and body". `codes.temporary_redirect` is 307 and `codes.permanent_redirect` is 308 (see `src/requests/status_codes.py`, lines 48-49). That matches.

## Where the block sits in one redirect hop

```text
while url:                                     line 204
    prepared_request = req.copy()              205   copy keeps body and headers
    ... consume resp, check max_redirects ...  211-222
    ... build absolute URL, keep fragment ...  224-245
    self.rebuild_method(prepared_request, resp)   247   may switch method to GET
    if status not in (307, 308):               250   <-- the answer
        pop Content-Length / Content-Type / Transfer-Encoding
        prepared_request.body = None           258
    headers.pop("Cookie", None)                261   cookies rebuilt from jar
    ... prepare_cookies ...                    266-269
    rebuild_proxies / rebuild_auth             272-273
    if rewindable: rewind_body(...)            283-284
    req = prepared_request; send it            287-301
```

`req.copy()` (see `PreparedRequest.copy` in `src/requests/models.py`, line 456) copies `body` and the headers. So unless something removes them, every hop would resend the original body. This block is that "something".

## What happens for each redirect code

| Status | `rebuild_method` (lines 370-392) | This block | Result |
|---|---|---|---|
| 301 | POST becomes GET; other methods unchanged | body and body headers dropped | a POST becomes a bodiless GET |
| 302 | anything except HEAD becomes GET | dropped | bodiless GET |
| 303 | anything except HEAD becomes GET | dropped | bodiless GET |
| 307 | unchanged | skipped | same method, same body |
| 308 | unchanged | skipped | same method, same body |

Why the three headers? `Content-Length`, `Content-Type` and `Transfer-Encoding` describe a body. Sending them with no body would make the next request malformed (for example a `Content-Length: 42` with nothing following).

One consequence worth knowing: on a 301 a `PUT` keeps its method (`rebuild_method` only rewrites `POST` for 301), but the body is still removed, because this check looks at the status code only, not at the method.

## Why the nearby code is wrong

- **`self.rebuild_method(prepared_request, resp)`** (line 247), and the method itself at lines 370-392. It decides the new HTTP method but never touches `body` or headers.
- **`headers.pop("Cookie", None)`** (line 261). It removes a header, but it is the `Cookie` header, not a body header. It exists so cookies can be rebuilt from the jar on lines 266-269.
- **`rebuild_proxies` and `rebuild_auth`** (lines 272-273). They may remove `Proxy-Authorization` or `Authorization`, which are credential headers, not body headers.
- **The `rewindable` / `rewind_body` block** (lines 278-284). This is the opposite case: for a request that *keeps* its body (307/308), it seeks a file-like body back to its start so it can be sent again. It doesn't remove anything.
- **Only lines 255-258** (the loop and the `body = None` assignment). That omits the `if` line and its multi-line condition, which the prompt explicitly asks for, so the anchor at line 250 isn't covered.
- **The whole `while url:` loop.** That is far larger than the 246-262 window.

## Takeaways

- To find "where X is removed", search for the assignment that removes it (`body = None`, `.pop(`). Then walk outward to the enclosing condition.
- When a loop copies an object at the top of each iteration (`req.copy()`), the interesting logic is whatever *undoes* parts of that copy afterward.
- HTTP redirect semantics are split across helpers here: method changes in `rebuild_method`, body handling inline. When reasoning about redirects in any client, check both.
