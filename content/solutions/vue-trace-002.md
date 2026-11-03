# vue-trace-002: Which endBatch re-runs the effect

**Answer:** `MutableReactiveHandler.set` -> `trigger` -> `endBatch` -> `ReactiveEffect.trigger` -> `ReactiveEffect.runIfDirty` -> `ReactiveEffect.run`

## Path
1. `MutableReactiveHandler.set` (`packages/reactivity/src/baseHandlers.ts`) writes the value with `Reflect.set`. The key already exists and the value changed, so it calls `trigger(target, TriggerOpTypes.SET, key, value, oldValue)`.
2. `trigger` (`packages/reactivity/src/dep.ts`) looks up the target's deps map, calls `startBatch()` (`batchDepth` 0 -> 1), runs `dep.trigger()` for the `count` dep through its inner `run` arrow, and finally calls `endBatch()`.
3. Inside that inner work, `Dep.trigger` bumps the dep's version and calls `Dep.notify`. `Dep.notify` opens its own batch (`batchDepth` 1 -> 2), calls `notify()` on each subscriber, and closes it in `finally`. `ReactiveEffect.notify` only calls `batch(this)`, which flags the effect `NOTIFIED` and links it into `batchedSub`. `Dep.notify`'s `endBatch` brings `batchDepth` from 2 back to 1, so it returns at once. All of this has returned before `trigger` reaches its last line.
4. `trigger`'s own `endBatch()` (`packages/reactivity/src/effect.ts`) brings `batchDepth` to 0, so it walks `batchedSub` and calls `(e as ReactiveEffect).trigger()` on each active effect.
5. `ReactiveEffect.trigger` is not paused and has no `scheduler` (the effect was created with no options), so it calls `this.runIfDirty()`.
6. `ReactiveEffect.runIfDirty` calls `isDirty(this)`. The link's version no longer matches the dep's version, so it returns true, and `runIfDirty` calls `this.run()`.
7. `ReactiveEffect.run` sets up tracking and calls `this.fn()`. That is the end condition.

## Why other candidates are wrong
- `set -> trigger -> Dep.trigger -> Dep.notify -> endBatch -> ...` is a real chain of calls in the code, but it is not on the stack when the effect runs. `Dep.notify`'s `endBatch` is nested inside `trigger`'s batch, so `--batchDepth > 0` and it returns without running anything.
- `Dep.notify -> ReactiveEffect.notify -> batch` is the notify phase. `batch` only queues the effect; it never calls `run`.
- Ending at `ReactiveEffect.runIfDirty` stops one step short: it decides whether to run but `run` is the method that calls `fn`.
- `ReactiveEffect.scheduler` is skipped because this effect has no scheduler. A component's render effect or a `watch` would go through a scheduler instead.
