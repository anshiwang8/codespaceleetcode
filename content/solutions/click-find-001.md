# click-find-001: Ordering parameters for processing

**Answer:** `src/click/core.py#iter_params_for_processing`

## How to find it

1. Start at `Command.parse_args` in `src/click/core.py`. After `parser.parse_args(...)` it loops `for param in iter_params_for_processing(param_order, self.get_params(ctx)): ... param.handle_parse_result(ctx, opts, args)`. That loop is where processing order is decided.
2. Open `iter_params_for_processing`. Its inner `sort_key` returns `(not item.is_eager, idx)` where `idx` is the position in `invocation_order` (or infinity if the user didn't pass it). Sorting on that tuple puts eager parameters first, then invoked ones in command-line order, then the rest in their declared order (sorted is stable).

## Why the others are wrong

- `Command.parse_args` calls the function and then does the processing loop; it doesn't compute the order itself.
- `Command.get_params` returns the declared parameters (plus the help option) without ordering them by invocation.
- `Parameter.handle_parse_result` processes one parameter; it has no notion of ordering between parameters.
