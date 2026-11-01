# ajv-architecture-003: Compiling the same schema twice

**Answer:** option d. `compileSchema` does not run again, and the second call returns the validation function stored on the cached schema entry.

## How to get there

1. `Ajv.compile` in `lib/core.ts` does `const sch = this._addSchema(schema, _meta)` and then returns `sch.validate || this._compileSchemaEnv(sch)`.
2. In `_addSchema`, after reading the `$id` the code does `let sch = this._cache.get(schema)` and `if (sch !== undefined) return sch`. The cache is keyed by the schema object itself, so the second call with the same reference returns the same `SchemaEnv` before any `_checkUnique` call, which also means no "already exists" error.
3. On the first call, `compileSchema` finished with `sch.validate = validate`. So on the second call `sch.validate` is already set, `||` short-circuits, and `_compileSchemaEnv` (and with it `compileSchema`) is never called. The returned value is the very same function.

## Why the others are wrong

- a: The cache hit and the `sch.validate ||` check together prevent a second compilation.
- c: The "already exists" error comes from `_checkUnique`, which is only reached for a schema that is not in the cache. A cache hit returns before it. This schema has no `$id` anyway, so `_checkUnique` is not called at all.
- b: `compile` returns `sch.validate` as is. Nothing wraps it.
