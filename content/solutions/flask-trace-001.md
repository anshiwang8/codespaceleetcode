# flask-trace-001: The automatic OPTIONS response

**Answer:** `Flask.wsgi_app` -> `Flask.full_dispatch_request` -> `Flask.dispatch_request` -> `Flask.make_default_options_response`

## How to find it

1. `Flask.wsgi_app` pushes the context (`ctx.push()`, a method on `AppContext`, not part of the Flask chain) and calls `self.full_dispatch_request(ctx)`.
2. `full_dispatch_request` calls `self.preprocess_request(ctx)`. Because no before_request callback returns a value, `rv is None` and it then calls `self.dispatch_request(ctx)`.
3. `dispatch_request` checks `getattr(rule, "provide_automatic_options", False) and req.method == "OPTIONS"` and in that case returns `self.make_default_options_response(ctx)` instead of calling the view.
4. `make_default_options_response` builds the response from `ctx.url_adapter.allowed_methods()`.

## Why other paths are wrong

- `wsgi_app` also calls `handle_exception` and `request_context`, but the prompt says no exception is raised, and neither leads to the OPTIONS response.
- `finalize_request`, `make_response` and `process_response` run after the response is built; the chain ends at the method that builds the response.
- `preprocess_request` is called by `full_dispatch_request` but is a sibling of `dispatch_request`, not part of this chain.
