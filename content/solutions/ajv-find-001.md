# ajv-find-001: Per-type coercion rules

**Answer:** `lib/compile/validate/dataType.ts#coerceData`

## How to get there

1. Search `lib/compile/` for `coerceTypes`. It is read in `lib/compile/validate/dataType.ts`, in `coerceAndCheckDataType` and `coerceToTypes`.
2. `coerceAndCheckDataType` computes which target types are coercible, emits a "wrong type" check, and inside that branch calls `coerceData(it, types, coerceTo)`.
3. `coerceData` is where the generated code is built. It declares `dataType` and `coerced` variables, and its inner `coerceSpecificType` is a `switch` over `"string"`, `"number"`, `"integer"`, `"boolean"`, `"null"` and `"array"`. Each case emits the conditions under which the value converts (for example `data === "false" || data === 0 || data === null` becomes `false`).

## Why other candidates are wrong

- `coerceAndCheckDataType` decides whether a type check and coercion are needed, then delegates. It holds none of the conversion rules.
- `coerceToTypes` only filters the schema's types down to those that can be coerced.
- `assignParentData` writes the coerced value back to the parent object, which is a later step.
- `checkDataType` / `checkDataTypes` generate the type tests, not conversions.
