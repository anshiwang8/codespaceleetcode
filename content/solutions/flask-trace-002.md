# flask-trace-002: Finding the handler for an aborted request

**Answer:** `Flask.wsgi_app` -> `Flask.full_dispatch_request` -> `Flask.handle_user_exception` -> `Flask.handle_http_exception` -> `App._find_error_handler`

## How to find it

1. `Flask.wsgi_app` pushes the context and calls `self.full_dispatch_request(ctx)` inside a `try`. Its own `except Exception` (which calls `handle_exception`) only runs if an exception escapes `full_dispatch_request`.
2. `full_dispatch_request` wraps `preprocess_request` and `dispatch_request` in `try ... except Exception as e: rv = self.handle_user_exception(ctx, e)`. The `NotFound` raised by `abort(404)` inside the view is caught here, so it never reaches `wsgi_app`'s handler.
3. `handle_user_exception` checks `isinstance(e, HTTPException) and not self.trap_http_exception(e)`. `NotFound` is an `HTTPException`, and with the default configuration `trap_http_exception` returns `False` (`TRAP_HTTP_EXCEPTIONS` is unset, and the bad-request trapping only applies to `BadRequest`/`BadRequestKeyError`). So it returns `self.handle_http_exception(ctx, e)`.
4. `handle_http_exception` returns early only for a `code` of `None` or a `RoutingException`. `NotFound` has code 404 and is neither, so it calls `self._find_error_handler(e, ctx.request.blueprints)`.
5. `_find_error_handler` is not defined on `Flask`; jump to definition lands on the base class `App` in `src/flask/sansio/app.py`. It loops over `(code, None)` and the blueprint names followed by `None` (the app), walking the exception's MRO in each handler map.

## Why the others are wrong

- `wsgi_app` -> `handle_exception` -> `_find_error_handler` is the shortest path in the code, but `handle_exception` only runs for exceptions that escape `full_dispatch_request`. It also looks up a handler for an `InternalServerError`, not for the 404.
- `wsgi_app` -> `full_dispatch_request` -> `handle_user_exception` -> `_find_error_handler` skips `handle_http_exception`. That direct call in `handle_user_exception` is the branch for exceptions that aren't `HTTPException`s, or that are trapped by `trap_http_exception`; neither applies with a `NotFound` and the default configuration.
- Including `dispatch_request` is wrong: it raised the exception, it didn't call `handle_user_exception`. The exception unwinds back to `full_dispatch_request`, which makes the call.
- `trap_http_exception` and `ensure_sync` are called along the way but don't lead to the lookup. `Scaffold._get_exc_class_and_code` is called by `_find_error_handler`, which is past the end of the chain.
