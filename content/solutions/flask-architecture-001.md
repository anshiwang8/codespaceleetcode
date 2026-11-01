# flask-architecture-001: What a custom session interface must implement

**Answer:** `SessionInterface.open_session` and `SessionInterface.save_session` in `src/flask/sessions.py`.

## How to find it

1. Open `SessionInterface` in `src/flask/sessions.py` and read each method body. `make_null_session`, `is_null_session`, the `get_cookie_*` helpers, `get_expiration_time` and `should_set_cookie` all have real implementations.
2. Only `open_session` and `save_session` consist of `raise NotImplementedError()`.
3. Cross-check with the callers: `AppContext` (`src/flask/ctx.py`) calls `open_session` when it needs the session, and `Flask.process_response` calls `save_session` near its end. `SecureCookieSessionInterface` is the default implementation and overrides both.

## Why the alternatives are wrong

- `make_null_session` and `is_null_session` have default implementations built on `null_session_class`.
- `SecureCookieSessionInterface.open_session` / `save_session` are concrete implementations in a subclass, not the unimplemented base methods.
