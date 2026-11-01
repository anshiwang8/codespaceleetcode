# mobx-find-001: Diffing a derivation's dependencies

**Answer:** `packages/mobx/src/core/derivation.ts#bindDependencies`

## How to get there

1. Start from the place that runs a derivation's function, `trackDerivedFunction` in `packages/mobx/src/core/derivation.ts`. It resets the derivation's `newObserving_` array, sets `trackingDerivation`, runs `f`, and then calls `bindDependencies(derivation)`.
2. Jump to `bindDependencies`. It de-duplicates `newObserving_` using each dependency's `diffValue`, then walks the previous list and calls `removeObserver(dep, derivation)` for anything that was not read this time, then walks the new list and calls `addObserver(dep, derivation)` for anything that was not observed before.

## Why other candidates are wrong

- `trackDerivedFunction` runs the function and collects reads. The prompt excludes it explicitly.
- `clearObserving` unobserves everything and sets `NOT_TRACKING_`. It does not diff.
- `addObserver` and `removeObserver` in `core/observable.ts` register one observer on one observable. They are called by `bindDependencies` but do no comparison.
- `reportObserved` (`core/observable.ts`) appends a read observable to `newObserving_` while the function runs. It is the recording step, not the diffing step.
