# fastapi-find-002: The class behind Depends

**Answer:** `fastapi/params.py`

## How to navigate there

`Depends` is a name that exists twice in `fastapi/`, once as a function and once as a class, so the key is to notice which is which.

```mermaid
flowchart LR
    A["from fastapi import Depends"] --> B["fastapi/__init__.py:14"]
    B --> C["param_functions.py:2391 def Depends"]
    C --> D["return params.Depends(...) at line 2477"]
    D --> E["params.py:791 class Depends"]
```

1. **Start from the public name.** `fastapi/__init__.py` line 14 is `from .param_functions import Depends as Depends`. That is the `Depends` users import.
2. **Read the function.** `fastapi/param_functions.py:2391` is `def Depends(`. Most of its length is `Annotated[..., Doc(...)]` parameter documentation and a long docstring. The body is one line at the end:

   ```python
   # fastapi/param_functions.py:2477
       return params.Depends(dependency=dependency, use_cache=use_cache, scope=scope)
   ```

3. **Resolve `params`.** The file imports `from fastapi import params` (line 6). So `params.Depends` is the class in `fastapi/params.py`:

   ```python
   # fastapi/params.py:790-799
   @dataclass(frozen=True)
   class Depends:
       dependency: Callable[..., Any] | None = None
       use_cache: bool = True
       scope: Literal["function", "request"] | None = None


   @dataclass(frozen=True)
   class Security(Depends):
       scopes: Sequence[str] | None = None
   ```

A search for `class Depends` across `fastapi/` gives exactly one hit, this one, which confirms it.

## The same pattern for every parameter helper

`param_functions.py` is a file of public factory functions, and each returns an instance of the class with the same name in `params.py`:

| Public function (`param_functions.py`) | Returns (line) | Class (`params.py`) |
|---|---|---|
| `Path()` | `params.Path(` (340) | `class Path` (142) |
| `Query()` | `params.Query(` (699) | `class Query` (232) |
| `Body()` | `params.Body(` (1694) | `class Body(FieldInfo)` (498) |
| `Depends()` | `params.Depends(` (2477) | `@dataclass class Depends` (791) |
| `Security()` | `params.Security(` (2568) | `@dataclass class Security(Depends)` (798) |

## Why split the function from the class?

The hint says the split is deliberate. The public functions are where the user-facing documentation lives: every argument is wrapped in `Annotated[..., Doc("...")]`, which makes them long but gives editors and docs rich help text. The classes stay small and are what the framework actually checks. For example, `analyze_param` in `fastapi/dependencies/utils.py` recognizes dependencies with `isinstance(value, params.Depends)` (line 476) and `isinstance(fastapi_annotation, params.Depends)` (line 473). Since `Depends` is a frozen dataclass, instances are hashable and immutable, so the same marker can safely appear in many signatures.

## Why the other files are wrong

- **`fastapi/param_functions.py`.** It defines the public *function* `Depends` that users call. The prompt explicitly excludes it: "not the file that defines the public function".
- **`fastapi/__init__.py`.** It only re-exports the function.
- **`fastapi/dependencies/models.py`.** It defines `Dependant` (line 32), the internal node FastAPI builds for each callable in the dependency tree. It is a different class, and the name differs by a few letters, which is the trap.
- **`fastapi/dependencies/utils.py`.** It *uses* `params.Depends` (in `analyze_param`, `get_parameterless_sub_dependant` and elsewhere) but doesn't define it.
- **`fastapi/security/`.** The security schemes (`OAuth2PasswordBearer` and others) are callables you pass *to* `Depends` or `Security`. They aren't the marker class.

## Takeaways

- A capitalized function that returns `module.SameName(...)` is a factory. "Go to definition" on the user-facing name lands on the function, so take one more jump to reach the class.
- Search for `class X` rather than `X` when a name is both a function and a class. It removes the call sites and the re-exports.
- Watch for near-identical names (`Depends`, `Dependant`). They are often different layers of the same feature: the user-facing marker and the internal model built from it.
