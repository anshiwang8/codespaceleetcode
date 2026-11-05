# jinja-find-001: The one real variable lookup

**Answer:** `src/jinja2/runtime.py#Context.resolve_or_missing`

## How to navigate there

The prompt names three entry points, so start from any of them and follow the calls inward.

1. Open `src/jinja2/runtime.py` and use the outline to jump to `Context.resolve` (line 212). Its body is three statements, and the first is a call to `self.resolve_or_missing(key)`.
2. Jump to the definition of `resolve_or_missing` (line 229). This is the method that actually touches the data: it reads `self.vars`, then `self.parent`, and otherwise returns `missing`.
3. To confirm it really is the shared core, check the other two entry points. `Context.__getitem__` (line 329) calls `self.resolve_or_missing(key)` too, and `Context.get` (line 200) calls `self[key]`, which is `__getitem__`.

```text
Context.get(key) ----> Context.__getitem__(key) ----+
                                                     +----> Context.resolve_or_missing(key)
Context.resolve(key) -------------------------------+         vars, then parent, else `missing`
```

## The key code

`src/jinja2/runtime.py`, lines 239–245:

```python
        if key in self.vars:
            return self.vars[key]

        if key in self.parent:
            return self.parent[key]

        return missing
```

Each caller then turns the sentinel into its own way of failing:

| Caller | What it does with `missing` |
|---|---|
| `resolve` | returns `self.environment.undefined(name=key)` |
| `__getitem__` | raises `KeyError(key)` |
| `get` | catches that `KeyError` and returns `default` |

`missing` is a module-level singleton, `missing: t.Any = _MissingType()` in `src/jinja2/utils.py` (line 30). A sentinel is needed because `None` is a perfectly valid value for a template variable.

## Why this design

`resolve_or_missing` is the one place that defines the lookup order: template-local `vars` shadow the `parent` mapping, which holds the render arguments and globals. Putting that rule in one method gives subclasses a single override point. It is also the method compiled templates use. `CodeGenerator.write_commons` in `src/jinja2/compiler.py` (line 724) writes `resolve = context.resolve_or_missing` into the preamble of every generated render function, so overriding `resolve` alone would not change how templates look up names.

## Why the plausible wrong answers are wrong

- **`Context.resolve`** looks like the lookup, but it does none of the searching itself. It calls `resolve_or_missing` and only converts the sentinel into an `Undefined`.
- **`Context.__getitem__`** and **`Context.get`** are the other two entry points named in the prompt, and both delegate.
- **`Context.__contains__`** (line 326) does check `vars` and then `parent`, but it answers a yes/no question and never returns a value or a sentinel.
- **`Context.get_all`** (line 251) merges `vars` and `parent` into one dict, but it does not look up a single name.

## Takeaways

When a class offers several similar-looking accessors, one of them is usually the real implementation and the rest are adapters that differ only in how they report failure. Follow any one of them to its first call, then check that the others land in the same place.
