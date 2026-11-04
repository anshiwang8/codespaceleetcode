# click-find-004: Falling back to a string for an inferred type

**Answer:** `src/click/types.py`, lines 1384-1385 in `convert_type`.

## How to find it

1. Open `src/click/types.py` and jump to `convert_type` (the implementation after its three `@t.overload` stubs).
2. Its first two lines are `guessed = _guess_type(ty, default)` and `is_guessed = guessed is not ty`. `_guess_type` returns `ty` unchanged when it is given, and otherwise a type derived from `default`, so `is_guessed` is true exactly when the type came from the default value.
3. The function then returns early for a tuple, a `ParamType` instance, `str`/`None`, `int`, `float` and `bool`. The next check is `if is_guessed: return STRING` on lines 1384-1385: an inferred type that none of those branches recognized falls back to the string type.

## Why nearby code is wrong

- `if guessed is str or guessed is None: return STRING` (lines 1372-1373) also returns `STRING`, but for `str` itself or when nothing could be inferred, which is not the case the prompt describes.
- The `if __debug__:` block after it raises `AssertionError` for an uninstantiated `ParamType` class; it doesn't return a type.
- The final `return FuncParamType(guessed)` is what an explicitly passed, unrecognized type gets, not an inferred one.
- The comment in `_guess_type` ("return None so convert_type falls through to STRING") describes the empty-default case, which ends at lines 1372-1373, not the inferred-type fallback.
