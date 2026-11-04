# requests-architecture-003: Connection errors raised by the adapter

**Answer:** `ConnectTimeout`, `ProxyError`, `SSLError` (all in `src/requests/exceptions.py`).

## How to find it

1. Open `HTTPAdapter.send` in `src/requests/adapters.py` and list the requests exceptions its `raise` statements use. Around the connection lookup it raises `InvalidURL`. Around `conn.urlopen(...)` it raises `ConnectionError`, `ConnectTimeout`, `RetryError`, `ProxyError`, `SSLError`, `ReadTimeout` and `InvalidHeader` (the import block at the top of the file confirms these come from `.exceptions`). It also raises a plain `ValueError` for a bad timeout tuple and re-raises the original urllib3 error with a bare `raise`; neither is a requests class.
2. Open `src/requests/exceptions.py` and read each class header:
   - `ProxyError(ConnectionError)` and `SSLError(ConnectionError)` derive from it directly.
   - `ConnectTimeout(ConnectionError, Timeout)` derives from it as its first base, alongside `Timeout`.
   - `ReadTimeout(Timeout)`, `RetryError(RequestException)`, `InvalidHeader(RequestException, ValueError)` and `InvalidURL(RequestException, ValueError)` do not.
3. The three subclasses of `ConnectionError` among the raised classes are the answer.

## Why the others are wrong

- `ReadTimeout` sits next to `ConnectTimeout` in both files and is also a timeout, but it derives only from `Timeout`, so `except ConnectionError` doesn't catch it. Only the connect timeout is also a connection error.
- `RetryError` is raised in the same `MaxRetryError` branch as `ProxyError` and `SSLError`, but it derives from `RequestException` directly.
- `InvalidProxyURL` is a subclass of `InvalidURL`, not of `ConnectionError`, and it's raised in `get_connection_with_tls_context` and `proxy_manager_for`, not in `send`.
- `ConnectionError` itself is excluded by the prompt.
