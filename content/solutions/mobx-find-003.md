# mobx-find-003: Deferring an observable's release

**Answer:** `packages/mobx/src/core/observable.ts#queueForUnobservation`

## How to get there

1. Open `removeObserver` in `packages/mobx/src/core/observable.ts`. It deletes the derivation from `observable.observers_`, and when the set's size reaches 0 it calls `queueForUnobservation(observable)`.
2. Jump to `queueForUnobservation`. If `isPendingUnobservation` is false, it sets it to `true` and pushes the observable onto `globalState.pendingUnobservations`. That is the flag-and-append step.

## Why other candidates are wrong

- `runPendingUnobservations` is the function that later processes the list: it clears the flag, releases the empty observer set, calls `onBUO` and suspends computed values. The prompt excludes it.
- `endBatch` decides when the list is processed (when `inBatch` drops to 0) but never appends to it.
- `removeObserver` is the caller. It removes the observer but delegates the queueing.
- `reportObserved` also calls `queueForUnobservation`, but it is not the function that flags and appends.
