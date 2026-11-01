# click-find-002: Rejecting leftover arguments

**Answer:** `src/click/core.py`, lines 1419-1426 in `Command.parse_args`.

## How to find it

1. Open `Command.parse_args`. Its steps are: the `no_args_is_help` check, running the parser (`parser.parse_args`), the loop over `iter_params_for_processing(...)` calling `handle_parse_result`, converting `UNSET` values to `None`, then the leftover check.
2. The leftover check is `if args and not ctx.allow_extra_args and not ctx.resilient_parsing:` and its body is a single `ctx.fail(ngettext("Got unexpected extra argument ...", ...).format(...))` call spanning the following lines. The `if` is on 1419 and the closing parenthesis of `ctx.fail` is on 1426.

## Why nearby code is wrong

- Lines 1415-1417 are a different loop: they replace the `UNSET` sentinel with `None` in `ctx.params`.
- Lines 1428-1429 store the leftover `args` on the context and update the option prefixes; they don't fail.
- The first `if` at the top of the method (`not args and self.no_args_is_help`) raises `NoArgsIsHelpError`, which is about having no arguments at all.
