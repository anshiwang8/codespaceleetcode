# ajv-trace-001: From validate to code generation

**Answer (in order):**

1. `lib/core.ts#Ajv.validate`
2. `lib/core.ts#Ajv.compile`
3. `lib/core.ts#Ajv._compileSchemaEnv`
4. `lib/compile/index.ts#compileSchema`
5. `lib/compile/validate/index.ts#validateFunctionCode`

## How to get there

1. In `Ajv.validate`, a string key goes through `getSchema`, but a schema object goes to `v = this.compile<T>(schemaKeyRef)`.
2. `Ajv.compile` does `const sch = this._addSchema(schema, _meta)` and then `return (sch.validate || this._compileSchemaEnv(sch))`. On a first-time compile `sch.validate` is not set yet, so `_compileSchemaEnv` runs.
3. `_compileSchemaEnv` branches on `sch.meta`. For an ordinary schema it calls `compileSchema.call(this, sch)` (via `.call`, still a call to that function).
4. `compileSchema` in `lib/compile/index.ts` creates a `CodeGen` and then calls `validateFunctionCode(schemaCxt)`, the entry point of `lib/compile/validate/index.ts`.

## Why other sequences are wrong

- `_addSchema` is called from `compile` too, but it only registers the schema (and may call `validateSchema`); it does not lead to code generation of the schema being compiled.
- `_compileMetaSchema` calls `compileSchema` as well, but only when `sch.meta` is true, which the prompt excludes.
- `getSchema` is the string-key branch of `validate`, which the prompt excludes.
- `validateFunction` and `topSchemaObjCode` are called from `validateFunctionCode`, so they come after the end condition.
