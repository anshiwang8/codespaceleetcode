# requests-architecture-001: Concrete authentication classes

**Answer:** `HTTPBasicAuth`, `HTTPProxyAuth`, `HTTPDigestAuth` (all in `src/requests/auth.py`).

## How to find it

1. Open `src/requests/auth.py` and list the `class` statements. There are four: `AuthBase`, `HTTPBasicAuth`, `HTTPProxyAuth`, `HTTPDigestAuth`.
2. `AuthBase` is the base: its `__call__` raises `NotImplementedError("Auth hooks must be callable.")`, so it defines the extension point rather than an implementation. The prompt excludes it.
3. Read each class header: `HTTPBasicAuth(AuthBase)`, `HTTPProxyAuth(HTTPBasicAuth)` (indirect), `HTTPDigestAuth(AuthBase)`.

## Why the obvious wrong answers are wrong

- Selecting `AuthBase` makes four items; the prompt asks for the three derived classes.
- Picking only the two classes that name `AuthBase` directly misses `HTTPProxyAuth`, which inherits via `HTTPBasicAuth` and overrides `__call__` to set `Proxy-Authorization` instead of `Authorization`.
- Test helpers such as `DummyAuth` in `tests/` are outside the file the prompt names.
