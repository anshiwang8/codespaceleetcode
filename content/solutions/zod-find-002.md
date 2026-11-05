# zod-find-002: When a folded intersection is closed

**Answer:** `packages/zod/src/v4/core/to-json-schema.ts`, lines 517 to 518: `if (objects.every((object) => object.additionalProperties === false)) {` followed by `folded.additionalProperties = false;`. A selection is accepted if it covers 517–518 and stays inside 515–519.

## The code

```ts
// packages/zod/src/v4/core/to-json-schema.ts:514-529
const folded: JSONSchema.ObjectSchema = { type: "object", properties };
if (required.size) folded.required = [...required];
// A key no member declares is rejected only when every member rejects it, so the fold is closed only when every member is. Otherwise it carries whatever the `catchall` members demand of such a key.
if (objects.every((object) => object.additionalProperties === false)) {
  folded.additionalProperties = false;
} else {
  const constraints: JSONSchema.BaseSchema[] = [];
  for (const object of objects) {
    const constraint = undeclaredConstraint(object);
    if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
      constraints.push(constraint);
  }
  if (constraints.length === 1) folded.additionalProperties = constraints[0]!;
  else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
}
return folded;
```

Line 517 is the check and line 518 is the assignment of `false`. Those two lines are the anchor.

## How to navigate there

1. **Open `foldObjects`** in `packages/zod/src/v4/core/to-json-schema.ts` (line 481). It has three parts:

   ```text
   foldObjects(members)                                         :481
   ├─ accept or reject each member (type "object", FOLDABLE_KEYS) :483-490
   ├─ merge properties and required                              :492-512
   └─ build `folded` and decide additionalProperties             :514-528   ◀── here
   ```

2. **Search inside it for `additionalProperties =`.** There are three assignments: `= false` at 518, `= constraints[0]!` at 526, and `= { allOf: constraints }` at 527. Only the first sets `false`, and the hint says its `if` has an `else` branch that collects constraints. That matches lines 517-519.

3. **Check the condition.** `objects.every((object) => object.additionalProperties === false)` is true only when every member is a closed object (`z.strictObject`, or `.strict()`). Strict equality with `false` matters: an absent `additionalProperties`, `{}` or a schema all fail it.

## Why the rule is "every", not "some"

The comment on line 516 states the rule: "A key no member declares is rejected only when every member rejects it." In Zod, an intersection of two objects pools their keys. A key is unrecognized only if *both* sides reject it. So the merged object can be closed only if all members are closed. If even one member is open or has a `catchall`, an unknown key may still be valid, and the `else` branch works out what it must satisfy.

| Members | Result of lines 517-527 |
|---|---|
| all closed | `additionalProperties: false` |
| one closed, one with `catchall(X)` | `additionalProperties: X` |
| two different catchalls `X` and `Y` | `additionalProperties: { allOf: [X, Y] }` |
| one closed, one plain open object | left unset |

## Why other selections are wrong

| Lines | Code | Why it is not the answer |
|---|---|---|
| 515 | `if (required.size) folded.required = [...required];` | Sets `required`, not `additionalProperties`. Inside the window, so including it with 517-518 is fine, but alone it misses the anchor. |
| 516 | the comment | Explains the rule but is not the check. |
| 517 only | the `if` | The prompt asks for the check together with the assignment. |
| 518 only | `folded.additionalProperties = false;` | Missing the check. |
| 519 | `} else {` | Starts the other branch. |
| 520-527 | the `else` branch | Never sets `false`. It sets the single constraint or an `allOf` of constraints. Also outside the window. |
| 476 | `extra === false` inside `undeclaredConstraint` | Reads `false` from a member and returns `null`. It does not set anything on the merged object. |
| `foldIntersection` (line 541) | | Decides whether to fold at all and copies the result back with `assignProps`. It does not decide `additionalProperties`. |

## Takeaways

- Searching for the assignment target (`additionalProperties =`) inside one function quickly lists every candidate line. Then match each one against the prompt.
- "Closed only if all are closed" is the usual rule when merging allow-lists where any side can accept. Look for `every` in such code.
- For location answers, select the smallest block that contains both the condition and the effect the prompt names.
