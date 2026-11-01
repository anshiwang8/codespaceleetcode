# zod-architecture-001: Folding a closed object with a catchall object

**Answer:** b, `{ type: "string" }`.

## Path
1. The first loop of `foldObjects` accepts both members: each has `type: "object"` and only keywords from `FOLDABLE_KEYS` (`type`, `properties`, `required`, `additionalProperties`).
2. Near the end of the function, `objects.every((object) => object.additionalProperties === false)` is false, because member B's `additionalProperties` is an object. So the closed branch is skipped.
3. The `else` branch calls `undeclaredConstraint` for each member. For A, `additionalProperties` is `false`, so it returns `null`. For B, `additionalProperties` is a non-empty object, so it returns `{ type: "string" }`.
4. Exactly one constraint is collected, so `constraints.length === 1` and `folded.additionalProperties = constraints[0]`, which is `{ type: "string" }`. A key neither member names is only accepted if it satisfies B's catchall, since A rejects it.

## Why the others are wrong
- `false` would require every member to be closed. B is not.
- `{ allOf: [...] }` is used only when there are two or more distinct constraints.
- Leaving it unset happens only when no member has a catchall constraint and the members are not all closed.
