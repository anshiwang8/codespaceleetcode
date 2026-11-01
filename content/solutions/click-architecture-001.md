# click-architecture-001: Precedence of fallback value sources

**Answer:** option `a`, the environment variable.

## How to find it

1. Open `Parameter.consume_value` in `src/click/core.py`. It starts with `value = opts.get(self.name, UNSET)` (the command-line value from the parser).
2. Then comes a chain of `if value is UNSET:` blocks, in this order: environment variable via `self.value_from_envvar(ctx)`, then the default map via `ctx.lookup_default(self.name)`, then `self.get_default(ctx)`.
3. Each block only runs while `value` is still `UNSET`, so the first source that yields a value wins. The environment variable is checked first.
4. The `ParameterSource` enum records the same ranking (`COMMANDLINE`, `ENVIRONMENT`, `DEFAULT_MAP`, `DEFAULT`), but the code is the authority.

## Why the others are wrong

- b and d are consulted only if the environment variable gave nothing.
- c: there is no conflict detection; the guards make the sources a fallback chain.
- `Option.consume_value` calls `super().consume_value` first and only adds prompting afterwards, which is why the prompt asks about the base version.
