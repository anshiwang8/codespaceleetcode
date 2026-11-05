# flask-find-001: Running request preprocessing callbacks

**Answer:** `src/flask/app.py#Flask.preprocess_request`

## How a strong engineer would get there

There are two good routes: follow the request lifecycle down from the WSGI entry point, or search for the registries the prompt describes.

**Route 1: top-down from `wsgi_app`.** The hint says the method is called from "the method that wraps both dispatching and error handling". In `src/flask/app.py`:

```text
Flask.wsgi_app                      line 1627
└── Flask.full_dispatch_request     line 1023   try / except around dispatch
    ├── Flask.preprocess_request    line 1409   <-- the answer
    ├── Flask.dispatch_request      line 993    only if preprocess returned None
    ├── Flask.handle_user_exception line 880    only if something raised
    └── Flask.finalize_request      line 1056   make_response + process_response
```

The key lines are in `full_dispatch_request`:

```python
# src/flask/app.py:1047-1054
        try:
            request_started.send(self, _async_wrapper=self.ensure_sync)
            rv = self.preprocess_request(ctx)
            if rv is None:
                rv = self.dispatch_request(ctx)
        except Exception as e:
            rv = self.handle_user_exception(ctx, e)
        return self.finalize_request(ctx, rv)
```

**Route 2: search for the data.** The prompt names two registries: URL value preprocessors and before-request callbacks. Searching `app.py` for `url_value_preprocessors` or `before_request_funcs` finds exactly one method that reads both.

## The method itself

```python
# src/flask/app.py:1423-1439
        req = ctx.request
        names = (None, *reversed(req.blueprints))

        for name in names:
            if name in self.url_value_preprocessors:
                for url_func in self.url_value_preprocessors[name]:
                    url_func(req.endpoint, req.view_args)

        for name in names:
            if name in self.before_request_funcs:
                for before_func in self.before_request_funcs[name]:
                    rv = self.ensure_sync(before_func)()

                    if rv is not None:
                        return rv  # type: ignore[no-any-return]

        return None
```

Every part of the prompt is visible here:

- **"first runs the registered URL value preprocessors"**: the first loop, lines 1426-1429. Their return values are ignored. They exist to mutate `req.view_args`, for example to pop a language code out of the URL before the view sees it.
- **"then runs the registered before-request callbacks"**: the second loop, lines 1431-1437.
- **"returning early as soon as one produces a non-None value"**: lines 1436-1437. Back in `full_dispatch_request`, a non-`None` `rv` means `dispatch_request` is skipped and that value becomes the response.

Both loops walk `names = (None, *reversed(req.blueprints))`: the app's own hooks (key `None`) first, then blueprints from the outermost parent down to the blueprint that owns the endpoint.

## Why the other candidates are wrong

- **`Flask.full_dispatch_request`** (line 1023). It calls `preprocess_request` and acts on its result, but it contains neither loop. It also sends the `request_started` signal, which is not a registered callback in the prompt's sense.
- **`Flask.dispatch_request`** (line 993). It runs *after* preprocessing, raises any routing exception, handles automatic `OPTIONS`, and calls the view function. No hooks.
- **`Flask.process_response`** (line 1441). The mirror image on the response side: it runs `after_this_request` callbacks and `after_request_funcs`, then saves the session.
- **`Flask.wsgi_app`** (line 1627). The outer entry point. It pushes the context and calls `full_dispatch_request`.
- **`Scaffold.before_request` and `Scaffold.url_value_preprocessor`** (`src/flask/sansio/scaffold.py`, lines 468 and 567). These are the decorators that *register* callbacks into the dicts. They don't run them, and they're not in `src/flask/app.py`.
- **`AppContext.push` / `AppContext.match_request`** (`src/flask/ctx.py`). They open the session and do URL matching before preprocessing. They don't run any user callbacks.

## Background: why preprocessing is its own method

Keeping preprocessing separate from dispatch lets `full_dispatch_request` use one rule for both: whatever value comes back, from a `before_request` hook or from the view, goes through `finalize_request` in the same way. So a `before_request` function that returns a redirect or a 401 still gets `after_request` processing and session saving. It is also a documented override point: a subclass of `Flask` can override `preprocess_request` without touching dispatch.

## Takeaways

- When a prompt describes a behaviour in terms of data ("registered preprocessors", "before-request callbacks"), search for the attribute that stores that data. The reader of that attribute is usually the answer.
- In request-processing frameworks, find the `try` block that wraps dispatch first. It shows every phase (preprocess, dispatch, error handling, finalize) in one screen.
- Notice the early return. "Stop as soon as a hook returns something" is a common pattern for short-circuiting, used for authentication checks and similar gates.
