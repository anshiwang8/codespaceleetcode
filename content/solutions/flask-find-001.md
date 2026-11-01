# flask-find-001: Running request preprocessing callbacks

**Answer:** `src/flask/app.py#Flask.preprocess_request`

## How to find it

1. Start from the request lifecycle. `Flask.wsgi_app` calls `full_dispatch_request`, which is the method that wraps everything. Read its `try` block: it calls `self.preprocess_request(ctx)` and only calls `self.dispatch_request(ctx)` when that returned `None`.
2. Open `preprocess_request`. It loops over `url_value_preprocessors` for the app and the request's blueprints, then over `before_request_funcs`, and does `return rv` the first time a callback returns something other than `None`.

## Why the others are wrong

- `Flask.dispatch_request` matches the already-routed rule to a view function and calls it; it doesn't run any hooks.
- `Flask.process_response` is the mirror image for `after_request` callbacks after the response exists.
- `Flask.full_dispatch_request` calls `preprocess_request`, it doesn't contain the loops itself.
