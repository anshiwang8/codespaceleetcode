# fastapi-architecture-001: When cleanup after yield runs

**Answer:** option `b`.

## How to find it

1. `_solve_generator` (`fastapi/dependencies/utils.py`) does `await stack.enter_async_context(cm)`, so the code after `yield` runs when the given `AsyncExitStack` is closed. Which stack is chosen is up to the caller.
2. In `solve_dependencies`, the generator branch sets `use_astack = request_astack` and switches to `function_astack` when `sub_dependant.scope == "function"`. Both stacks come from `request.scope` (`fastapi_inner_astack` and `fastapi_function_astack`).
3. Those stacks are created in the inner `app` of `request_response` (`fastapi/routing.py`):
   - `async with AsyncExitStack() as request_stack:` (outer) sets `fastapi_inner_astack`.
   - `async with AsyncExitStack() as function_stack:` (inner) sets `fastapi_function_astack`, and wraps only `response = await f(request)`.
   - `await response(scope, receive, send)` sits after the inner block but still inside the outer one.
4. So the function stack closes when `f(request)` (the route handler, which builds the response) returns, before the response is sent. The request stack closes after `await response(...)` completes.

## Why the others are wrong

- a ignores the inner stack: function scope is cleaned up before sending.
- c swaps the two.
- d: the code before `yield` runs while resolving dependencies, but cleanup happens at stack exit, after the endpoint has run.
