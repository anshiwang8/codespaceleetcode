# zod-find-002: When a folded intersection is closed

**Answer:** `packages/zod/src/v4/core/to-json-schema.ts`, lines 517 to 518: `if (objects.every((object) => object.additionalProperties === false)) {` followed by `folded.additionalProperties = false;`.

## Path
1. Open `foldObjects` in `packages/zod/src/v4/core/to-json-schema.ts`. After merging `properties` and `required`, it builds `folded` and then decides `additionalProperties`.
2. The `if` on `objects.every(...)` checks that every member is closed (`additionalProperties === false`). Only then is the merged object closed too, because a key is rejected only when every member rejects it.
3. The two lines of the `if` head and its body are the anchor. The `else` branch handles the open case by collecting `catchall` constraints.

## Why other selections are wrong
- Lines 520 to 527 (the `else` branch) never set `false`. They set `additionalProperties` to the single constraint or to an `allOf` of constraints.
- `foldIntersection` (just below) decides whether to fold at all. It does not set `additionalProperties`.
