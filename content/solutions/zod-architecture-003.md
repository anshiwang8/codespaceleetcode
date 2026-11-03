# zod-architecture-003: The checks behind a string chain

**Answer:**
- `packages/zod/src/v4/core/checks.ts#$ZodCheckMinLength~2`
- `packages/zod/src/v4/core/checks.ts#$ZodCheckOverwrite~2`
- `packages/zod/src/v4/core/checks.ts#$ZodCheckLowerCase~2`

(The `~2` entries are the `$constructor` constants; the plain names are the interfaces declared just above them.)

## Path
1. `z.string()` returns a `ZodString`. Its initializer calls `_ZodString.init`, and `_ZodString` in `packages/zod/src/v4/classic/schemas.ts` defines `min`, `trim` and `lowercase` as `this.check(checks.minLength(...))`, `this.check(checks.trim())` and `this.check(checks.lowercase(params))`.
2. `checks` there is `packages/zod/src/v4/classic/checks.ts`, which only re-exports core functions under new names: `_minLength as minLength`, `_trim as trim`, `_lowercase as lowercase`, all from `../core/index.js`, which re-exports `core/api.ts`.
3. In `packages/zod/src/v4/core/api.ts`:
   - `_minLength` returns `new checks.$ZodCheckMinLength(...)`.
   - `_trim` returns `_overwrite((input) => input.trim())`, and `_overwrite` returns `new checks.$ZodCheckOverwrite(...)`.
   - `_lowercase` returns `new checks.$ZodCheckLowerCase(...)`.
4. `this.check(...)` only clones the schema with the new check appended to `def.checks`; the clone is a schema, not a check.

## Why the others are wrong
- `$ZodCheckGreaterThan` is what `.min()` creates on number schemas (through `_gte`), and `$ZodCheckMinSize` is for sets and files. The string `.min()` uses `_minLength`.
- `$ZodCheckStringFormat` and `$ZodCheck` run only as `.init(inst, def)` calls from inside `$ZodCheckLowerCase`, `$ZodCheckMinLength` and `$ZodCheckOverwrite`. They are never the target of `new` here.
- There is no lowercase transform among these checks: `.lowercase()` validates (a regex string-format check), while `.toLowerCase()` would be the one that goes through `_overwrite`. Mixing the two up swaps `$ZodCheckLowerCase` for a second `$ZodCheckOverwrite`.
- The interfaces `$ZodCheckMinLength`, `$ZodCheckOverwrite` and `$ZodCheckLowerCase` (without `~2`) are types and cannot be instantiated.
