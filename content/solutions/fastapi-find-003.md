# fastapi-find-003: Swapping a dependency for its override

**Answer:** `fastapi/dependencies/utils.py`, lines 680-695 in `solve_dependencies`.

## How to find it

1. Search the repo for `dependency_overrides`. In `fastapi/dependencies/utils.py` it appears only inside `solve_dependencies`, which takes a `dependency_overrides_provider` argument (the FastAPI app, passed down from `get_request_handler`).
2. In the `for sub_dependant in dependant.dependencies:` loop, the first statement after the local setup is `if (dependency_overrides_provider and dependency_overrides_provider.dependency_overrides):`. Its body reads the override mapping with `.get(original_call, original_call)` and calls `get_dependant(...)` to make `use_sub_dependant`.
3. The `if` spans lines 680 to 695, the closing parenthesis of the `get_dependant(...)` call.

## Why nearby code is wrong

- Lines 676-679 set up the loop variables (`call`, `use_sub_dependant`) that the `if` may overwrite.
- Lines 697-708 recursively call `solve_dependencies` for the (possibly replaced) sub-dependant.
- Lines 717-733 choose between the cache, generator, coroutine and sync-callable paths for actually running the dependency.
