# rxjs-find-001: The shared upstream-subscription helper

**Answer:** `packages/rxjs/src/util/observable-helpers.ts#subscribeToSource`

## Path
1. Open `packages/rxjs/src/filter.ts`. `filterOperator` returns `this[create]((subscriber) => { ... })`. Inside, the only call that touches the source is `subscribeToSource(this, subscriber, { next: ... })`.
2. `filter.ts`, `scan.ts` and `reduce.ts` all use the same helper. Jump to its definition in `util/observable-helpers.ts`.
3. The helper wraps each override in a `guard` that forwards a thrown error to `subscriber.error`, uses the subscriber's own `next`, `error` and `complete` where no override is given, and calls `source.subscribe(..., { signal })` where the signal is the subscriber's signal, optionally combined with an extra one.

## Why the others are wrong
- `convertObservableValue` in the same file only turns an `ObservableValue` into an `Observable` with `Observable.from`. It does not subscribe or handle errors.
- `create` (in `create.ts`) builds the derived Observable. It does not subscribe upstream.
