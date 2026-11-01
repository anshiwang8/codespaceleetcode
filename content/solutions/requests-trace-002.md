# requests-trace-002: Where proxy credentials become a header

**Answer:** `HTTPAdapter.send` -> `HTTPAdapter.get_connection_with_tls_context` -> `HTTPAdapter.proxy_manager_for` -> `HTTPAdapter.proxy_headers` -> `_basic_auth_str`

## How to find it

1. Start in `HTTPAdapter.send` (`src/requests/adapters.py`). Its first real step is `self.get_connection_with_tls_context(request, verify, proxies=proxies, cert=cert)`, which obtains the urllib3 connection pool.
2. In `get_connection_with_tls_context`, `select_proxy` picks a proxy for the URL. In the `if proxy:` branch it calls `self.proxy_manager_for(proxy)`.
3. `proxy_manager_for` has three branches: cached manager, `socks...` proxy, and everything else. The prompt says non-SOCKS and not cached, so it takes the last branch and calls `self.proxy_headers(proxy)`.
4. `proxy_headers` calls `get_auth_from_url(proxy)` and, if a username is present, `_basic_auth_str(username, password)` to build `Proxy-Authorization`.

## Why other paths are wrong

- `HTTPAdapter.get_connection` is the deprecated sibling of `get_connection_with_tls_context`; `send` doesn't call it.
- The SOCKS branch of `proxy_manager_for` calls `get_auth_from_url` directly and never reaches `proxy_headers`.
- `get_auth_from_url` is also called by `proxy_headers`, but it only extracts the credentials; it doesn't produce the `Basic ...` string.
- `HTTPAdapter.request_url` also looks at the proxy, but only to decide the request-line form.
