# vue-find-001: Deferring a notified effect

**Answer:** `packages/reactivity/src/effect.ts#batch`

## Path
1. Open `packages/reactivity/src/effect.ts` and go to `ReactiveEffect.notify`.
2. After the early return for a running, non-recursive effect, its last statement is `batch(this)`, guarded by a check that the `NOTIFIED` flag is not yet set.
3. Jump to `batch`. It sets `EffectFlags.NOTIFIED`, then links the subscriber into `batchedSub` (or `batchedComputed` for computeds) through its `next` field. Nothing runs yet.
4. The queued subscribers are run later by `endBatch` in the same file, which calls `ReactiveEffect.trigger` on each one.

## Why the others are wrong
- `startBatch` and `endBatch` open and close a batch by changing `batchDepth` and draining the list. Neither is called from `ReactiveEffect.notify`.
- `ReactiveEffect.trigger` is what eventually re-runs an effect, but `notify` does not call it.
