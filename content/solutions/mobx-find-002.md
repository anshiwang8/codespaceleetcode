# mobx-find-002: Runaway reaction cycle guard

**Answer:** lines 292-300 of `packages/mobx/src/core/reaction.ts`, the `if (++iterations === MAX_REACTION_ITERATIONS) { ... }` block inside `runReactionsHelper`.

## How to get there

1. `runReactions` (in `reaction.ts`) returns early when a batch is open or reactions are already running, and otherwise passes `runReactionsHelper` to the scheduler. The helper is the draining loop the prompt describes.
2. In `runReactionsHelper`, `while (allReactions.length > 0)` re-checks the queue because running a reaction can queue more. The first statement in the loop increments `iterations` and compares it to `MAX_REACTION_ITERATIONS` (100, declared above `runReactions`).
3. The block calls `console.error` with a message about a reaction that does not converge and then `allReactions.splice(0)` to clear the queue. Select it from the `if` line through its closing brace.

## Why other selections are wrong

- The guard at the top of `runReactions` (`inBatch > 0 || isRunningReactions`) prevents re-entrancy, not infinite loops, and is in a different function.
- Lines 301-304 take the remaining reactions and run each one. That is the normal path of the loop.
- Selecting the whole `while` loop spans more than the allowed window.
