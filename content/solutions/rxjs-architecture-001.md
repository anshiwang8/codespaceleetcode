# rxjs-architecture-001: The errors the single operator raises itself

**Answer:**
- `packages/rxjs/src/empty-error.ts`
- `packages/rxjs/src/not-found-error.ts`
- `packages/rxjs/src/sequence-error.ts`

## Path
1. Open `packages/rxjs/src/single.ts`. It imports `EmptyError`, `NotFoundError` and `SequenceError`, one from each of three files.
2. In `singleOperator`, each one is constructed and sent with `subscriber.error(...)`: `SequenceError` when a second matching value arrives, `NotFoundError` when the source had values but none matched, and `EmptyError` when the source completed without any value.
3. The three class definitions are the files listed above. Any other error reaching the subscriber is the source's own error, forwarded unchanged.

## Why other files are wrong
- `timeout-error.ts`, `argument-out-of-range-error.ts` and the other error files belong to different operators and are not imported by `single.ts`.
- `util/observable-helpers.ts` is imported for `subscribeToSource` and defines no error class.
