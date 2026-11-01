# ajv-find-002: Source text becomes a function

**Answer:** lines 171-172 of `lib/compile/index.ts`: `const makeValidate = new Function(...)` and `const validate: AnyValidateFunction = makeValidate(this, this.scope.get())`.

## How to get there

1. Open `compileSchema` in `lib/compile/index.ts`. It creates a `CodeGen`, calls `validateFunctionCode(schemaCxt)` to fill it, then `gen.optimize(...)` and `gen.toString()`.
2. The next steps build `sourceCode` (scope references plus `return <validate code>`), optionally pass it through `opts.code.process`, and then compile it. Look for the `new Function` constructor: the source text is wrapped as a function taking the Ajv instance and the scope, and that function is called with `this` and `this.scope.get()` to get the actual validation function.
3. Select exactly those two statements.

## Why other selections are wrong

- Line 167 builds the source string. It does not create a function.
- Line 169 (`opts.code.process`) is an optional user hook that rewrites the string.
- Line 173 stores the validation function in the scope, which comes after it has been created.
- Selecting only line 171 leaves the anchor's second line uncovered, so it fails. Selecting the whole `try` block spans beyond the 30 line limit.
