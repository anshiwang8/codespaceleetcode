# click-trace-001: From shell completion request to a parsed context

**Answer:** `shell_complete` -> `ShellComplete.complete` -> `ShellComplete.get_completions` -> `_resolve_context` -> `Command.make_context`

## How to find it

1. `shell_complete` splits `"bash_complete"` into shell `bash` and instruction `complete`, looks up the class with `get_completion_class` (a call, but not on the chain toward `make_context`), builds `comp`, and in the `instruction == "complete"` branch calls `comp.complete()`. No shell subclass overrides `complete`, so it is `ShellComplete.complete`.
2. `ShellComplete.complete` calls `self.get_completion_args()` (subclass hook), then `self.get_completions(args, incomplete)`, then `format_completion` for each item. `get_completions` is the one that leads on.
3. `get_completions` calls `_resolve_context(self.cli, self.ctx_args, self.prog_name, args)`, `_resolve_incomplete(...)`, and finally `obj.shell_complete(ctx, incomplete)`.
4. `_resolve_context` sets `resilient_parsing` and does `with cli.make_context(prog_name, args.copy(), **ctx_args) as ctx:`. That is the first call to `Command.make_context`.

## Why other candidates are wrong

- `get_completion_args` is called by `complete` but is a sibling; it doesn't lead to `make_context`.
- `_resolve_incomplete` and `Command.shell_complete` come after `_resolve_context` in `get_completions`; they use the context rather than create it.
- `Group.resolve_command` and the nested `cmd.make_context(...)` calls inside `_resolve_context` come later than the first `make_context` call.
