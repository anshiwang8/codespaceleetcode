# rtk-architecture-003: Classes in the toolkit core

**Answer:**

- `packages/toolkit/src/createAsyncThunk.ts#RejectWithValue`
- `packages/toolkit/src/createAsyncThunk.ts#FulfillWithMeta`
- `packages/toolkit/src/listenerMiddleware/exceptions.ts#TaskAbortError`
- `packages/toolkit/src/utils.ts#Tuple`

## How to get there

1. Search `packages/toolkit/src/` for the `class` keyword at the start of a declaration, and skip anything under `query/` and test folders.
2. The hits are: `RejectWithValue` and `FulfillWithMeta` in `createAsyncThunk.ts` (small wrapper classes returned by `rejectWithValue` / `fulfillWithValue`), `TaskAbortError` in `listenerMiddleware/exceptions.ts`, and `Tuple` in `utils.ts` (an `Array` subclass used for typed middleware and enhancer lists).

## Why other things are wrong

- The rest of the toolkit is built from factory functions (`createSlice`, `createReducer`, `configureStore`, `createListenerMiddleware`, ...), so those are not classes even though their names look like constructors.
- Classes under `packages/toolkit/src/query/` are excluded by the prompt.
- `Slice` and `EntityAdapter` are interfaces/types, not classes.
