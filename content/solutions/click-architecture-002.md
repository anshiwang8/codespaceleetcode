# click-architecture-002: Control-flow exceptions outside ClickException

**Answer:** `Abort` and `Exit` in `src/click/exceptions.py`.

## How to find it

1. Open `src/click/exceptions.py` and read each `class` line. `ClickException(Exception)` is the root of the user-facing errors: `UsageError`, `BadParameter`, `MissingParameter`, `NoSuchOption`, `NoSuchCommand`, `BadOptionUsage`, `BadArgumentUsage`, `NoArgsIsHelpError` and `FileError` all derive from it, directly or via `UsageError` / `BadParameter`.
2. Two classes have a different base: `Abort(RuntimeError)` and `Exit(RuntimeError)`.
3. Cross-check in `Command.main` (`src/click/core.py`): there are separate `except Exit` and `except Abort` clauses, apart from `except ClickException`, because these signal control flow (exit with a code, abort the program) rather than a message to show.

## Why the others are wrong

- `ClickException` is excluded by the prompt.
- `FileError` looks different from `UsageError`, but it still derives from `ClickException`.
- `NoArgsIsHelpError` and `NoSuchCommand` are `UsageError` subclasses.
