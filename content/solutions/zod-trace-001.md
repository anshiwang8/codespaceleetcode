# zod-trace-001: From emit to merging intersection members

**Answer:** `JSONSchemaGenerator.emit` -> `finalize` -> `foldIntersection` -> `foldObjects`

## Path
1. `JSONSchemaGenerator.emit` (`json-schema-generator.ts`) resets two guard fields, then calls `extractDefs(this.ctx, schema)` and `finalize(this.ctx, schema)`.
2. `finalize` (`to-json-schema.ts`) post-processes the generated schema. Near the end, in a loop over `ctx.intersections`, it calls `foldIntersection(json)` for every emitted object that holds an `allOf` from an intersection.
3. `foldIntersection` checks that the `allOf` has at least two members and no foldable keywords of its own. With no union among the members it takes the `!unions.length` branch and calls `foldObjects(allOf)`.
4. `foldObjects` is the end: it returns the merged object schema (or `null` if a member has a keyword it cannot fold).

## Why other candidates are wrong
- `extractDefs` is also called from `emit`, but it works on `$defs` and `$ref` extraction, not on folding.
- `assignProps` is called by `foldIntersection` after the fold, to copy the result back. It does not merge members.
- `foldObjects` calls itself for nested key merges; that recursion is not part of this path.
