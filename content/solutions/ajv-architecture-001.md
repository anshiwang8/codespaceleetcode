# ajv-architecture-001: Where validation keywords are registered

**Answer:** `lib/vocabularies/validation/index.ts`

## How to get there

1. `Ajv._addVocabularies` in `lib/ajv.ts` loops over `draft7Vocabularies` and calls `this.addVocabulary(v)`.
2. `lib/vocabularies/draft7.ts` builds that list from several vocabularies: core, validation, applicator, format, metadata and content. Each is imported from its own directory's `index.ts`.
3. `lib/vocabularies/validation/index.ts` holds the array for the validation vocabulary: `limitNumber`, `multipleOf`, `limitLength`, `pattern`, `limitProperties`, `required`, `limitItems`, `uniqueItems`, then `type`, `nullable`, `constKeyword`, `enumKeyword`. That is the single place you would add or remove a validation keyword.

## Why other files are wrong

- `lib/vocabularies/validation/required.ts`, `pattern.ts`, `enum.ts` and `const.ts` each implement the code generation for one keyword, and the prompt excludes them.
- `lib/vocabularies/draft7.ts` only combines vocabularies. It does not list individual keywords.
- `lib/vocabularies/applicator/index.ts` registers keywords such as `properties` and `allOf`, not `required` or `enum`.
- `lib/core.ts` has `addVocabulary` and `addKeyword`, the generic registration methods, but no list of built-in validation keywords.
