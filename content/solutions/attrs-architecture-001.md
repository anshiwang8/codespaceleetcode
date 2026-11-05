# attrs-architecture-001: Hashing a default mutable class

**Answer:** a. The class's `__hash__` is set to None, so calling `hash()` on an instance raises `TypeError`.

## How a strong engineer gets there

The decision is made in the inner `wrap` of `attrs`, but it depends on two inputs computed earlier: `eq` and `hash`. Work them out in order.

### 1. What `define` passes

`define`'s signature (`src/attr/_next_gen.py`, lines 23-47) has `eq=None`, `hash=None`, `unsafe_hash=None`, `frozen=False` and `auto_detect=True`, and `define.do_it` passes all of them straight to `attrs`.

### 2. What `eq` becomes

`attrs` first normalizes `eq` with a default of `None`:

```python
# src/attr/_make.py, line 1469
eq_, order_ = _determine_attrs_eq_order(cmp, eq, order, None)
```

So `eq_` is still `None`. Inside `wrap`, it is resolved against the class:

```python
# src/attr/_make.py, lines 1490-1492
eq = not is_exc and _determine_whether_to_implement(
    cls, eq_, auto_detect, ("__eq__", "__ne__")
)
```

`_determine_whether_to_implement` (line 1327) returns its `default` of `True` when the flag is `None`, `auto_detect` is on, and the class defines neither `__eq__` nor `__ne__` itself. So `eq` is `True`.

### 3. The hashability decision

`unsafe_hash` is `None`, so `hash` stays `None`, and the class isn't an exception. That leads to this branch:

```python
# src/attr/_make.py, lines 1506-1518
elif hash is None:
    if auto_detect is True and _has_own_attribute(cls, "__hash__"):
        hashability = Hashability.LEAVE_ALONE
    elif eq is True and is_frozen is True:
        hashability = (
            Hashability.HASHABLE_CACHED
            if cache_hash
            else Hashability.HASHABLE
        )
    elif eq is False:
        hashability = Hashability.LEAVE_ALONE
    else:
        hashability = Hashability.UNHASHABLE
```

There is no own `__hash__`. `eq` is `True`, but `is_frozen` is `False`, and `eq` isn't `False`, so the result is `UNHASHABLE`.

### 4. What `UNHASHABLE` does

```python
# src/attr/_make.py, lines 1590-1593
if props.is_hashable:
    builder.add_hash()
elif props.hashability is Hashability.UNHASHABLE:
    builder.make_unhashable()
```

`ClassProps.is_hashable` is true only for `HASHABLE` and `HASHABLE_CACHED`, so `make_unhashable` runs, and it sets `self._cls_dict["__hash__"] = None` (line 1067). Python treats a class attribute `__hash__ = None` as "unhashable", so `hash(instance)` raises `TypeError`.

## The decision as a table

| Condition (with `hash=None`) | Result |
|---|---|
| Class defines its own `__hash__` (auto-detect) | Leave alone |
| `eq` true and frozen | Generate `__hash__` (cached if `cache_hash`) |
| `eq` false | Leave alone, so identity hashing |
| otherwise: `eq` true and mutable | **`__hash__ = None`** |

## Why the other options are wrong

- **b.** A field-based `__hash__` is generated only for `HASHABLE`, which with `hash=None` needs the class to be frozen.
- **c.** Leaving `__hash__` alone happens only when the class defines `__hash__` itself or `eq` is `False`. Neither is true here.
- **d.** Caching needs `HASHABLE_CACHED`, which needs `cache_hash=True` (default `False`) and a hashable class in the first place.

## Background: why attrs refuses to hash mutable value objects

If two instances compare equal by value, Python requires them to have equal hashes. A hash computed from mutable fields would change when a field changes, and an object in a `set` or used as a `dict` key would then be lost in the wrong bucket. Python's own rule is the same: a class that defines `__eq__` without `__hash__` gets `__hash__ = None`. attrs (like `dataclasses`) follows it. Making the class frozen, or passing `unsafe_hash=True`, is the explicit way to opt in.

## Takeaways

- When a decision depends on derived values, compute each input on paper before reading the decision itself. Here, misreading `eq` as `None` instead of `True` leads you to option c.
- Enum-valued intermediate decisions (`Hashability`) are a good place to start reading. They name every possible outcome, so you only need to find which branch you're in.
