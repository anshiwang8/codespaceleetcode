# click-find-001: Ordering parameters for processing

**Answer:** `src/click/core.py#iter_params_for_processing`

## How a strong engineer would get there

Start from where processing happens and work back to where the order is decided. The hint points at `Command.parse_args` (`src/click/core.py:1396`):

```python
# src/click/core.py:1400-1404
        parser = self.make_parser(ctx)
        opts, args, param_order = parser.parse_args(args=args)

        for param in iter_params_for_processing(param_order, self.get_params(ctx)):
            _, args = param.handle_parse_result(ctx, opts, args)
```

The parser returns three things. `param_order` is the list of parameters in the order the user typed them. The `for` loop processes parameters one at a time, and the sequence it iterates is whatever `iter_params_for_processing` returns. "Go to definition" on that name lands on a module-level function near the top of the file, line 172.

## The function

```python
# src/click/core.py:188-196
    def sort_key(item: Parameter) -> tuple[bool, float]:
        try:
            idx: float = invocation_order.index(item)
        except ValueError:
            idx = float("inf")

        return not item.is_eager, idx

    return sorted(declaration_order, key=sort_key)
```

The whole policy is in the sort key, a tuple compared element by element:

| Key part | Value | Effect |
|---|---|---|
| `not item.is_eager` | `False` for eager, `True` otherwise | `False < True`, so eager parameters sort first |
| `idx` | position in `invocation_order`, or `inf` if not passed | within each group, passed parameters in command-line order, then unpassed ones |

`sorted` is stable, so parameters that tie (all the unpassed ones in a group have `idx = inf`) keep their order from `declaration_order`, which is the declared order from `get_params`.

## Worked example

A command declares, in this order, `--name`, `--count`, `--verbose`, and the eager `--version`. `get_params` (line 1132) appends the help option at the end, which is also eager. The user runs:

```text
cli --count 3 --version --name x
```

| Parameter | `is_eager` | `idx` | Sort key |
|---|---|---|---|
| `--name` | no | 2 | `(True, 2)` |
| `--count` | no | 0 | `(True, 0)` |
| `--verbose` | no | not passed | `(True, inf)` |
| `--version` | yes | 1 | `(False, 1)` |
| `--help` | yes | not passed | `(False, inf)` |

Processing order: `--version`, `--help`, `--count`, `--name`, `--verbose`.

This is why `--version` works no matter where it appears on the command line: it is processed before everything else, and its callback prints the version and exits before the other parameters are validated. `version_option` and `help_option` both default to `is_eager=True` (`src/click/decorators.py`, lines 555 and 623).

## Why the other candidates are wrong

- **`Command.parse_args`** (line 1396). It calls `iter_params_for_processing` and runs the loop, but the ordering logic isn't in it. It is also a method, and the prompt asks for a module-level function.
- **`Group.parse_args`** (line 2038). It calls `super().parse_args(...)` and then splits off the subcommand. No ordering.
- **`Command.get_params`** (line 1132). It returns the declared parameters plus the help option, in declaration order. That is the input to the sort, not the sort.
- **`Parameter.handle_parse_result`** (line 2929). Processes one parameter (consume the value, convert it, run the callback). It has no notion of other parameters' order.
- **The parser** (`src/click/parser.py`). It records `param_order` as options and arguments are seen (`state.order.append(self.obj)`, lines 182 and 213), but that is just the raw invocation order. It doesn't know about eagerness or combine it with declaration order.
- **The nested `sort_key`.** It holds the key logic, but it is a local function inside the answer, not a module-level function.

## Background: why the order matters

Callbacks run during processing. Processing parameters in a predictable order means:

- **Eager parameters can short-circuit.** `--help` and `--version` exit from their callbacks, so they need to run before required parameters are checked. Otherwise `cli --help` would fail with "Missing option" first.
- **Callbacks see earlier values.** A callback can read `ctx.params` for parameters already processed. Following the user's command-line order makes that dependency intuitive.

## Takeaways

- When a loop processes items "in some order", look at what it iterates over. The ordering logic is in whatever produces that sequence.
- A tuple sort key encodes a multi-level priority: first by the first element, then by the second. Using `float("inf")` for "not present" puts missing items last without a separate pass.
- Remember that Python's `sorted` is stable. Ties keep their input order, which is often an intentional part of the design.
