# click-find-002: Rejecting leftover arguments

**Answer:** `src/click/core.py` lines 1419-1426, the `if args and not ctx.allow_extra_args and not ctx.resilient_parsing:` statement and its `ctx.fail(...)` body, inside `Command.parse_args`.

```python
# src/click/core.py:1419-1426
        if args and not ctx.allow_extra_args and not ctx.resilient_parsing:
            ctx.fail(
                ngettext(
                    "Got unexpected extra argument ({args})",
                    "Got unexpected extra arguments ({args})",
                    len(args),
                ).format(args=" ".join(map(str, args)))
            )
```

All of lines 1419 to 1426 must be selected. The selection may extend from line 1415 to line 1430, so including a blank line or the `ctx.args = args` line after it is fine.

## How to navigate there

1. Open `src/click/core.py` and go to `Command.parse_args` (line 1396). Be careful: `Group.parse_args` (line 2038) has the same name. The prompt says `Command`.
2. The method is only 35 lines long. Read it as a pipeline:

```text
Command.parse_args(ctx, args)                         line 1396
  1397  if no args and no_args_is_help  -> raise NoArgsIsHelpError
  1400  parser = self.make_parser(ctx)
  1401  opts, args, param_order = parser.parse_args(args)
  1403  for param in iter_params_for_processing(...):
  1404      _, args = param.handle_parse_result(ctx, opts, args)
  1415  for name, value in ctx.params.items():  UNSET -> None
  1419  if args and not allow_extra_args and not resilient_parsing:   <-- answer
  1420-1426      ctx.fail("Got unexpected extra argument(s) (...)")
  1428  ctx.args = args
  1429  ctx._opt_prefixes.update(parser._opt_prefixes)
  1430  return args
```

3. The prompt says the check runs "once every parameter has been processed", so it comes after the `for param in ...` loop. The hint says the condition "also looks at two flags on the context". Line 1419 tests `args` plus `ctx.allow_extra_args` and `ctx.resilient_parsing`.
4. Search tip: searching for `extra argument` (the error message) jumps straight to line 1422.

## What the three conditions mean

| Condition | Meaning |
|---|---|
| `args` | Something is left. The parser gives every positional token it couldn't assign back in `args`, and each `handle_parse_result` call may consume more. |
| `not ctx.allow_extra_args` | The command hasn't opted into extra arguments. For a plain `Command` the class default is `allow_extra_args = False` (line 1043). `Group` sets it to `True` (line 1733) because the leftovers are the subcommand name and its arguments. |
| `not ctx.resilient_parsing` | Not in "never fail" mode. Shell completion turns this on (`ctx_args["resilient_parsing"] = True` in `src/click/shell_completion.py:710`), because a half-typed command line must not raise an error while the user is pressing Tab. |

`ctx.fail` (line 837) raises `UsageError(message, self)`. That reaches `Command.main` as a `ClickException`, which prints the usage line and `Error: Got unexpected extra argument (...)` and exits with code 2. The `ngettext` call chooses the singular or plural message from `len(args)`.

## Why the nearby code is wrong

- **Lines 1415-1417** (the `UNSET` to `None` loop). It sits right before the answer and also runs "after every parameter has been processed", but it rewrites `ctx.params` and never fails.
- **Lines 1428-1430** (`ctx.args = args`, `_opt_prefixes`, `return args`). These are what happens when the check passes, or when extra args are allowed: the leftovers are stored on the context for the command (or the group) to use.
- **Lines 1397-1398** (`if not args and self.no_args_is_help ...`). It raises a usage-type error too (`NoArgsIsHelpError`), but for the opposite situation: no arguments at all. It also runs before parsing, not after.
- **Only lines 1420-1426** (the `ctx.fail(...)` call). That leaves out the `if` line, which is part of the anchor.
- **`Group.parse_args`** (lines 2038-2050). It calls `super().parse_args` and splits the leftovers into the subcommand and its arguments. It contains no extra-argument error.
- **`Context.fail`** (line 837). The helper that raises. The prompt asks for the `if` statement in `parse_args` that decides to call it.

## Takeaways

- Searching for a user-visible error message is often the fastest way to find the check that produces it.
- Parsing code is usually a pipeline: parse, process each parameter, normalise, validate what's left, store. Knowing the stages tells you where each kind of check must be.
- Watch for flags like `resilient_parsing`. A single context flag that disables errors is how Click reuses the normal parsing code for shell completion.
