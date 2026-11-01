# click-find-003: Where the progress bar is implemented

**Answer:** `src/click/_termui_impl.py`

## How to find it

1. Open `src/click/termui.py` and find the implementation of `progressbar` (the first two definitions are `@overload` signatures). Its last statement is `return ProgressBar(...)`.
2. Look at the import just before that return (inside the function): `ProgressBar` comes from `._termui_impl`. Jump to the definition: `class ProgressBar(t.Generic[V])` in `src/click/_termui_impl.py`, with the rendering and update logic.

## Why other files are wrong

- `src/click/termui.py` has the public `progressbar` wrapper that only instantiates the class.
- `src/click/utils.py` and `src/click/_compat.py` contain helpers (echo, stream handling) the progress bar uses but not the class.
