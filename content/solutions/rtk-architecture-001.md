# rtk-architecture-001: Where immer's produce is renamed

**Answer:** `packages/toolkit/src/immerImports.ts`

## How to get there

1. Open `packages/toolkit/src/createReducer.ts` (or `utils.ts`, `entities/state_adapter.ts`). They import `createNextState` from `./immerImports` or `../immerImports`, not from `immer`.
2. `immerImports.ts` is one `export { ... } from 'immer'` statement that includes `produce as createNextState` next to `current`, `isDraft`, `isDraftable` and `setUseStrictIteration`. The rename happens there.

## Why other files are wrong

- `packages/toolkit/src/index.ts` re-exports `createNextState` from `./immerImports` for the public API. It does not perform the rename.
- `packages/toolkit/src/query/utils/immerImports.ts` is a separate module for the RTK Query code (it exports `applyPatches`, `produceWithPatches`, `enablePatches`, ...). The prompt excludes the query folder.
- `createReducer.ts` and `entities/state_adapter.ts` consume `createNextState` but import it from `immerImports.ts`.
