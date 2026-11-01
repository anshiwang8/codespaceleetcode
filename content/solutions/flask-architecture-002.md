# flask-architecture-002: Order of response postprocessing

**Answer:** option `c`.

## How to find it

1. Open `Flask.process_response` in `src/flask/app.py`. It has three consecutive blocks.
2. First: `for func in ctx._after_request_functions:` applies each callback to the response. `_after_request_functions` is a list on `AppContext` that `after_this_request` (`src/flask/ctx.py`) appends to.
3. Second: `for name in chain(ctx.request.blueprints, (None,)):` applies the functions registered in `self.after_request_funcs`, each list iterated with `reversed(...)`.
4. Third: `if not self.session_interface.is_null_session(ctx._get_session()): self.session_interface.save_session(...)` runs last. Saving after the callbacks means a callback can still modify the session.

## Why the others are wrong

- b puts the session save first, but it is the last block.
- a swaps the first two blocks.
- d: the two groups are separate loops, never interleaved.
