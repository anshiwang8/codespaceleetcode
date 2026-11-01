# flask-find-002: Re-raising when no handler matches

**Answer:** `src/flask/app.py`, lines 911-912 (`if handler is None:` followed by `raise`) in `Flask.handle_user_exception`.

## How to find it

1. `full_dispatch_request` catches any `Exception` from preprocessing or dispatch and calls `handle_user_exception`.
2. In `handle_user_exception` there are three stages: BadRequestKeyError tweaking, HTTPException handling via `handle_http_exception`, and the generic lookup `handler = self._find_error_handler(e, ctx.request.blueprints)`.
3. Immediately after the lookup, `if handler is None: raise` re-raises the active exception with its original traceback. The exception then propagates up to `wsgi_app`, whose `except Exception` calls `handle_exception` (which turns it into a 500 or propagates it in debug mode).

## Why nearby code is wrong

- Lines 906-907 (`if isinstance(e, HTTPException) and not self.trap_http_exception(e)`) delegate to `handle_http_exception` rather than re-raising.
- Line 914 calls the found handler through `ensure_sync`; it is the opposite case (a handler exists).
- The bare `raise` / `raise e` statements in `handle_exception` belong to a different method and a different condition (`propagate`).
