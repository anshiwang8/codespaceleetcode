# starlette-architecture-001: Layers of the middleware stack

**Answer:** option `e`: ServerErrorMiddleware, RequestBodyLimitMiddleware, C, A, B, ExceptionMiddleware, Router.

## How to work it out

Everything happens in `starlette/applications.py`. Three pieces of code decide the order.

**1. The constructor stores the list as given** (line 60):

```python
        self.user_middleware = [] if middleware is None else list(middleware)
```

So `user_middleware` is `[A, B]`.

**2. `add_middleware` inserts at the front** (line 107):

```python
        self.user_middleware.insert(0, Middleware(middleware_class, *args, **kwargs))
```

So after `app.add_middleware(C)`, `user_middleware` is `[C, A, B]`. Middleware added later ends up *outside* middleware passed to the constructor.

**3. `build_middleware_stack` wraps the list from the inside out** (lines 74–83), and `Starlette.__call__` calls it on the first request:

```python
        middleware = [Middleware(ServerErrorMiddleware, handler=error_handler, debug=debug)]
        if self.max_body_size is not None:
            middleware.append(Middleware(RequestBodyLimitMiddleware, max_body_size=self.max_body_size))
        middleware += self.user_middleware
        middleware.append(Middleware(ExceptionMiddleware, handlers=exception_handlers, debug=debug))

        app = self.router
        for cls, args, kwargs in reversed(middleware):
            app = cls(app, *args, **kwargs)
        return app
```

The list is `[ServerError, BodyLimit, C, A, B, Exception]`. The loop walks it in reverse, starting with the router. The first class wrapped, `ExceptionMiddleware`, ends up innermost, and the last, `ServerErrorMiddleware`, is outermost. Reversing while wrapping means **the list order is the order a request passes through**, outermost first.

```text
ServerErrorMiddleware              <- outermost: catches anything unhandled, returns a 500
  RequestBodyLimitMiddleware       <- only present because max_body_size is set
    C                              <- add_middleware inserted it at index 0
      A
        B                          <- constructor order is kept
          ExceptionMiddleware      <- innermost: HTTPException and registered handlers
            Router
```

## Why the other options are wrong

- **a** puts C after A and B. That would be true if `add_middleware` appended, but it calls `insert(0, ...)`.
- **b** puts RequestBodyLimitMiddleware after the user middleware. It is appended to the list right after ServerErrorMiddleware and before `self.user_middleware` is added.
- **c** swaps the two built-in outer layers. ServerErrorMiddleware is always the first element of the list, so it is always outermost.
- **d** reverses the user middleware. That comes from thinking `reversed(...)` reverses the final order. It doesn't, because each wrap puts the new layer outside the previous one, which undoes the reversal.

## Why it is designed this way

- **ServerErrorMiddleware outermost** means even an exception from a user middleware or from the body-limit layer is turned into a 500 response. With `debug=True` it can render a traceback.
- **ExceptionMiddleware innermost** means handled exceptions such as `HTTPException` become normal responses *before* they pass back out through user middleware, so a user middleware sees a 404 response rather than an exception.
- **The body limit just inside ServerErrorMiddleware** applies the app-wide limit before any user middleware can read the body.
- **`add_middleware` inserting at the front** gives the common "each call wraps the app again" behavior, where the most recent call is the outermost layer. It also explains the check at line 105: once the stack has been built it is cached in `self.middleware_stack`, so adding middleware after that would have no effect, and Starlette raises a `RuntimeError` instead.

## Takeaways

For any "wrap in a loop" code, write the loop out for a small list by hand. Whether a loop iterates forwards or in reverse, and whether each step wraps inside or outside, are two separate questions, and the final order depends on both.
