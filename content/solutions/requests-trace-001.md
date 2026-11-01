# requests-trace-001: From requests.get to a PreparedRequest

**Answer:** `api.get` -> `api.request` -> `Session.request` -> `Session.prepare_request`

## How to find it

1. `src/requests/api.py#get` is a thin wrapper that calls `request("get", url, params=params, **kwargs)`.
2. `api.request` opens `with sessions.Session() as session:` and returns `session.request(method=method, url=url, **kwargs)`. The `Session()` construction and `__enter__` are excluded by the prompt.
3. `Session.request` builds a `Request` (a constructor, excluded), then calls `self.prepare_request(req)`.
4. `Session.prepare_request` is the one that calls `merge_setting` for headers, params and auth, `merge_hooks` for hooks, and merges the cookie jars before calling `PreparedRequest.prepare`.

## Why other candidates are wrong

- `Session.send` and `Session.merge_environment_settings` are also called from `Session.request`, but neither builds the `PreparedRequest`.
- `PreparedRequest.prepare` is called by `prepare_request` and doesn't merge session defaults; the prompt asks for the method that does the merging.
