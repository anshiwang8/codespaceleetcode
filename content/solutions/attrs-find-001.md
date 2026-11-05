# attrs-find-001: What a frozen class does on assignment

**Answer:** `_frozen_setattrs` (`src/attr/_make.py#_frozen_setattrs`)

## How a strong engineer gets there

1. The prompt says the class builder puts a `__setattr__` into the class's namespace. The builder is `_ClassBuilder` in `src/attr/_make.py`. Its `__init__` collects everything that will end up on the class in `self._cls_dict`.
2. Search that method for `is_frozen`. The branch is short:

   ```python
   # src/attr/_make.py, lines 726-730
   if props.is_frozen:
       self._cls_dict["__setattr__"] = _frozen_setattrs
       self._cls_dict["__delattr__"] = _frozen_delattrs

       self._wrote_own_setattr = True
   ```

3. Jump to the definition of `_frozen_setattrs` (line 561):

   ```python
   # src/attr/_make.py, lines 561-575
   def _frozen_setattrs(self, name, value):
       """
       Attached to frozen classes as __setattr__.
       """
       if isinstance(self, BaseException) and name in (
           "__cause__",
           "__context__",
           "__traceback__",
           "__suppress_context__",
           "__notes__",
       ):
           BaseException.__setattr__(self, name, value)
           return

       raise FrozenInstanceError
   ```

It ignores `value` and raises `FrozenInstanceError` for every attribute, except the handful that Python itself sets on exceptions while raising and chaining them. Without that exception, a frozen exception class couldn't be raised.

## Why plausible wrong answers are wrong

- **`_frozen_delattrs`** (line 578) sits right below and is installed in the same branch, but as `__delattr__`. The prompt excludes it.
- **`_ClassBuilder.add_setattr`** builds a `__setattr__` for *mutable* classes, which runs on_setattr hooks such as validators and converters. `attrs.wrap` only calls it when the class is not frozen (`if not frozen: builder.add_setattr()`).
- **`_has_frozen_base_class`** (line 1626) only *checks* whether a base class's `__setattr__` is `_frozen_setattrs`, so subclasses of frozen classes inherit frozenness.
- **`src/attr/setters.py#frozen`** is an *attribute-level* on_setattr hook that freezes a single field. It is not installed as the class's `__setattr__`.

## But how is `__init__` able to set fields?

If `__setattr__` always raises, the generated `__init__` can't use `self.x = x`. For frozen classes, the init script generator uses `_setattr` and friends (around line 2099), which write the field through `object.__setattr__` (saved as `_OBJ_SETATTR`) and bypass the class's own `__setattr__`. That is the usual pattern for immutable Python objects.

## Takeaways

- When a library "adds" methods to a class, look for the dictionary it fills before the class is finalized. Here every dunder passes through `_cls_dict`.
- Functions shared by many generated classes, like `_frozen_setattrs`, are often plain module-level functions that are checked by identity elsewhere (`base_cls.__setattr__ is _frozen_setattrs`). Find references on them to see how the library detects its own features.
