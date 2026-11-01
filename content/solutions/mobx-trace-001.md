# mobx-trace-001: From a value write to running reactions

**Answer (in order):**

1. `packages/mobx/src/types/observablevalue.ts#ObservableValue.set`
2. `packages/mobx/src/types/observablevalue.ts#ObservableValue.setNewValue_`
3. `packages/mobx/src/core/atom.ts#Atom.reportChanged`
4. `packages/mobx/src/core/observable.ts#endBatch`
5. `packages/mobx/src/core/reaction.ts#runReactions`

## How to get there

1. `ObservableValue.set` calls `this.prepareNewValue_` and, if the result is not `UNCHANGED`, calls `this.setNewValue_(newValue)`.
2. `setNewValue_` stores the value and calls `this.reportChanged()`. `ObservableValue` extends `Atom`, so this resolves to `Atom.reportChanged`.
3. `Atom.reportChanged` is `startBatch(); propagateChanged(this); endBatch()`.
4. `endBatch` does `if (--globalState.inBatch === 0) { runReactions() ... }`. Outside any action the counter returns to zero here, so it calls `runReactions`.

## Why other sequences are wrong

- `prepareNewValue_` is called by `set` before `setNewValue_`, but it only runs interceptors and the equality check. It does not lead to `runReactions`.
- `propagateChanged` is also called by `reportChanged`; it marks observers stale and may call `onBecomeStale_` (which schedules reactions), but it never calls `runReactions` itself.
- `startBatch` only increments the counter.
- `notifyListeners` and `hasListeners` in `setNewValue_` are excluded by the prompt's "no change listeners" condition, and they do not lead to `runReactions` either.
- `runReactionsHelper` and `Reaction.runReaction_` are called after `runReactions`, so they come after the end condition.
