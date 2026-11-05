# rtk-architecture-003: Classes in the toolkit core

**Answer:**

- `packages/toolkit/src/createAsyncThunk.ts#RejectWithValue`
- `packages/toolkit/src/createAsyncThunk.ts#FulfillWithMeta`
- `packages/toolkit/src/listenerMiddleware/exceptions.ts#TaskAbortError`
- `packages/toolkit/src/utils.ts#Tuple`

## How a strong engineer would find them

This is an inventory question, so search instead of browsing. Search `packages/toolkit/src` for `class` as a whole word, then throw away three kinds of hits: anything under `query/`, anything under `tests/` or in `*.test.*` files, and mentions inside comments. One comment hit shows up in `devtoolsExtension.ts` (a doc comment about the `Record` class), and it is not a declaration.

What is left is exactly four declarations:

| Class | File:line | Exported? | What it is for |
|---|---|---|---|
| `RejectWithValue` | `createAsyncThunk.ts:64` | no | Marker wrapper returned by the `rejectWithValue` helper |
| `FulfillWithMeta` | `createAsyncThunk.ts:76` | no | Marker wrapper returned by the `fulfillWithValue` helper |
| `TaskAbortError` | `listenerMiddleware/exceptions.ts:14` | yes | Thrown when a listener task is cancelled or completes |
| `Tuple` | `utils.ts:29` | yes | `Array` subclass used for typed middleware and enhancer lists |

Two of the four are not exported, so searching the public API in `index.ts` would miss them. The text search is the reliable route.

## Why these four are classes

Each one exists because the code needs `instanceof` or array subclassing, which a plain object can't give it.

**`RejectWithValue` and `FulfillWithMeta`** let the thunk tell a special return value apart from a normal one. The payload creator gets helpers that wrap their argument, and the thunk checks the type of whatever comes back:

```ts
// packages/toolkit/src/createAsyncThunk.ts:701-706
if (result instanceof RejectWithValue) {
  throw result
}
if (result instanceof FulfillWithMeta) {
  return fulfilled(result.payload, requestId, arg, result.meta)
}
```

Both classes have a private `_type` field whose comment says it is type-only and "does not exist at runtime". It keeps TypeScript from treating the two structurally identical classes as interchangeable.

**`TaskAbortError`** is thrown by the listener middleware's task helpers (`listenerMiddleware/task.ts:13` and `:28`) and recognised with `instanceof TaskAbortError` (`listenerMiddleware/index.ts:461`, `task.ts:63`). Note that it `implements SerializedError` and does not extend `Error`. A search for `extends Error` would not find it.

**`Tuple`** extends `Array`, calls `Object.setPrototypeOf(this, Tuple.prototype)` in its constructor, overrides `Symbol.species` and `concat`, and adds `prepend`, so derived arrays stay `Tuple`s. Its job is mostly at the type level: it keeps the exact element types of a middleware list. `getDefaultMiddleware.ts:62` and `getDefaultEnhancers.ts:22` construct it.

## Why other candidates are wrong

- **Factory functions with constructor-like names** (`createSlice`, `createReducer`, `configureStore`, `createListenerMiddleware`, `createEntityAdapter`) are plain functions that return objects. Redux Toolkit is written almost entirely in this style.
- **`Slice` and `EntityAdapter`** are TypeScript interfaces (`createSlice.ts:54`, `entities/models.ts:186`). Interfaces are not classes and produce no runtime code.
- **`HandledError`** (`query/HandledError.ts`) and **`NamedSchemaError`** (`query/standardSchema.ts`) are real classes, but they live under `query/`, which the prompt excludes.
- **`miniSerializeError`** in `createAsyncThunk.ts` sits right next to the two marker classes, but it is an arrow function that returns a plain object.
- **`Tuple.<constructor>`** or other class members are parts of a class, not separate classes. The answer is the class symbol itself.
- **Classes in test files** are excluded by the prompt.

## Takeaways

- Inventory questions ("select all N") are best answered with a whole-word search plus deliberate filtering. Check the count against the prompt before submitting.
- In a codebase that prefers functions and plain objects, the few classes that do exist usually have a specific reason: `instanceof` checks, error types, or subclassing a built-in. That reason is often the most interesting thing about them.
- Don't assume error types extend `Error`. Search for `class`, not `extends Error`.
