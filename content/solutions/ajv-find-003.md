# ajv-find-003: Counting characters for maxLength

**Answer:** `lib/runtime/ucs2length.ts#ucs2length`

## How to get there
1. Open `lib/vocabularies/validation/limitLength.ts`. Its `code` builds the length expression as `it.opts.unicode === false ? _\`${data}.length\` : _\`${useFunc(cxt.gen, ucs2length)}(${data})\``.
2. With default options `unicode` is not `false`, so the generated code calls the function registered by `useFunc(cxt.gen, ucs2length)`.
3. Jump to the definition of `ucs2length` (imported from `../../runtime/ucs2length`). It walks the string with `charCodeAt` and counts a high surrogate followed by a low surrogate as one character. Its `.code` property tells standalone code where to `require` it from.

## Why other candidates are wrong
- `useFunc` in `lib/compile/util.ts` only adds the function to the generated code's scope and returns a name for it. It doesn't look at the string.
- `def.code` in `limitLength.ts` builds the comparison expression, but the counting happens at validation time inside the helper.
