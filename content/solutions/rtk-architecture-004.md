# rtk-architecture-004: A slice reducer and extraReducers on one type

**Answer:** d, `2`.

## How to get there

1. `createSlice` (`packages/toolkit/src/createSlice.ts`) registers the slice reducer `added` through `handleNormalReducerDefinition`, which calls `context.addCase('counter/added', caseReducer)`. That stores the `+= 1` reducer in `context.sliceCaseReducersByType['counter/added']`.
2. The slice's `reducer` lazily calls `buildReducer`. It runs the `extraReducers` callback through `executeReducerBuilderCallback` (`packages/toolkit/src/mapBuilders.ts`), which returns `[actionsMap, actionMatchers, defaultCaseReducer]`: `actionsMap['counter/added']` is the `+= 10` reducer, `actionMatchers` holds the `endsWith('/added')` matcher with `*= 2`, and the default case sets `-1`.
3. `buildReducer` merges the case reducers with `{ ...extraReducers, ...context.sliceCaseReducersByType }`. The slice's own map is spread last, so for `'counter/added'` the `+= 1` reducer replaces the `+= 10` one. The `+= 10` reducer is gone.
4. It then calls `createReducer` (`packages/toolkit/src/createReducer.ts`) with a builder that adds one case per key, then the slice matchers (none), then the extra matchers, then the default case.
5. The returned `reducer` builds `caseReducers = [actionsMap[action.type], ...matching matcher reducers]`, so `[+= 1, *= 2]`. That list has non-empty entries, so the default case is not used. It reduces in order: `0 + 1 = 1`, then `1 * 2 = 2`.

## Why the others are wrong

- a (20) assumes the `extraReducers` case wins the merge: `0 + 10 = 10`, then `* 2`. The spread order puts the slice's reducers last, so they win.
- b (1) assumes a matched case stops processing, like a `switch`. `createReducer` runs the case reducer and then every matching matcher.
- c (22) assumes both case reducers for the same type run. They are merged into one object key, so only one survives.
