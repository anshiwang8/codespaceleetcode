# rxjs-trace-002: How forkJoin recognises a dictionary of sources

**Answer:** `forkJoinImpl` -> `normalizeInputs` -> `isPlainObject`

## Path
1. `forkJoinImpl` (`fork-join.ts`) starts by peeling off an optional result selector and then calls `normalizeInputs(inputArguments)` to get `{ keys, sources }`.
2. `normalizeInputs` handles the single-argument case. It returns the array as the sources if it is an array. Otherwise it calls `isPlainObject(first)`. If that is true, it uses the object's keys and values.
3. `isPlainObject` checks that the value is a non-null object whose prototype is `Object.prototype`. That is the end of the trace.

## Why other candidates are wrong
- `createResultObject` is also called from `forkJoinImpl`, but later and inside the subscribe callback. It builds the output object from keys and values and does not test the input.
- `subscribeToSource` is called from `forkJoinImpl` as well, but it lives in another file and is excluded by the prompt.
