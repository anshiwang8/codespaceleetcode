# zod-architecture-002: The core base of the classic ZodType

**Answer:** `packages/zod/src/v4/core/schemas.ts`

## Path
1. In `packages/zod/src/v4/classic/schemas.ts`, find `export const ZodType = core.$constructor("ZodType", (inst, def) => { ... core.$ZodType.init(inst, def); ... })`.
2. `core` is the namespace import of `packages/zod/src/v4/core/` (its `index` re-exports everything). Go to the definition of `$ZodType`. The value (a `const` built with `core.$constructor("$ZodType", ...)`) is declared in `packages/zod/src/v4/core/schemas.ts`; its initializer sets up `_zod.def`, the checks and `_zod.run`.
3. This shows the layering: the core layer implements parsing, and the classic layer adds the fluent API (`parse`, `optional`, and so on) on top by calling the core initializer first.

## Why the others are wrong
- `packages/zod/src/v4/core/core.ts` defines the generic `$constructor` helper used to build every class-like trait, not `$ZodType` itself.
- `packages/zod/src/v4/classic/schemas.ts` defines `ZodType`, which wraps `$ZodType`.
- `packages/zod/src/v4/mini/schemas.ts` is the alternative API layer, which also builds on the core one.
