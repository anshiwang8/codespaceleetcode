# vue-architecture-003: Registry of DOM-only directive transforms

**Answer:** `packages/compiler-dom/src/index.ts`

## Path
1. Open `compile` in `packages/compiler-dom/src/index.ts`. It calls `baseCompile` with `directiveTransforms: extend({}, DOMDirectiveTransforms, options.directiveTransforms || {})`.
2. `DOMDirectiveTransforms` is an exported constant defined a few lines above in the same file. It maps `cloak`, `html`, `text`, `model`, `on` and `show` to their transforms, and the `model` and `on` entries override the ones from compiler-core.
3. A new DOM-only directive would get a new key there, with its transform function written in `packages/compiler-dom/src/transforms/` and imported into this file.

## Why other files are wrong
- `packages/compiler-core/src/compile.ts` holds the base preset (`on`, `bind`, `model`), which is shared with non-DOM targets. DOM entries are merged on top of it.
- Files such as `packages/compiler-dom/src/transforms/vShow.ts` define individual transform functions. They are not where the record is built.
