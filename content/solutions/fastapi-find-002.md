# fastapi-find-002: The class behind Depends

**Answer:** `fastapi/params.py`

## How to find it

1. Search for `def Depends` in `fastapi/`. The public function is in `fastapi/param_functions.py` (with a long docstring and `Annotated` parameter docs); its body returns `params.Depends(dependency=dependency, use_cache=use_cache, scope=scope)`.
2. That `params.` prefix points to the module `fastapi/params.py`, which contains `@dataclass(frozen=True) class Depends` with the fields `dependency`, `use_cache` and `scope`. `Security` (a subclass adding `scopes`) is next to it.
3. `analyze_param` in `fastapi/dependencies/utils.py` uses that class (`isinstance(..., params.Depends)`) to recognize dependencies.

## Why the other files are wrong

- `fastapi/param_functions.py` defines the public function `Depends`, not the class it returns.
- `fastapi/dependencies/models.py` defines `Dependant`, the internal node built from a signature; it is a different class (note the spelling).
- `fastapi/dependencies/utils.py` consumes the class, it doesn't define it.
