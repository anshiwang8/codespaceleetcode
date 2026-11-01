# mobx-architecture-001: Staleness through a computed value

**Answer:** option c, `POSSIBLY_STALE_`.

## How to get there

1. `Atom.reportChanged` calls `propagateChanged(X)` in `packages/mobx/src/core/observable.ts`. That function walks only X's direct observers, which here is the computed value C. For each `d` whose `dependenciesState_` is `UP_TO_DATE_` it calls `d.onBecomeStale_()` and then sets `d.dependenciesState_ = STALE_`.
2. `ComputedValue.onBecomeStale_` (`core/computedvalue.ts`) is just `propagateMaybeChanged(this)`.
3. `propagateMaybeChanged(C)` goes through C's observers, which include the reaction R. Because R is `UP_TO_DATE_`, it sets `R.dependenciesState_ = POSSIBLY_STALE_` and calls `R.onBecomeStale_()` (which schedules R).
4. Control returns to `propagateChanged`, which marks C itself `STALE_`. R was not a direct observer of X, so nothing touches it again.

R stays `POSSIBLY_STALE_` until `runReaction_` runs it. At that point `shouldCompute` re-evaluates C, and only if C's value really changed does R become `STALE_`.

## Why the others are wrong

- a: `NOT_TRACKING_` means a derivation that is not holding dependency data (not yet run, or disposed). R has run.
- b: R is changed by `propagateMaybeChanged`, so it is no longer `UP_TO_DATE_`.
- d: `STALE_` is only set directly on observers of the changed atom (C here), or later on R through `propagateChangeConfirmed` after C recomputes to a different value.
