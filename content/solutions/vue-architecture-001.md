# vue-architecture-001: Directive transforms in the base compiler preset

**Answer:**
- `packages/compiler-core/src/transforms/vBind.ts`
- `packages/compiler-core/src/transforms/vModel.ts`
- `packages/compiler-core/src/transforms/vOn.ts`

## Path
1. Open `getBaseTransformPreset` in `packages/compiler-core/src/compile.ts`. It returns a tuple.
2. The first element is the node-transform array. The second is an object literal with three keys: `on: transformOn`, `bind: transformBind`, `model: transformModel`.
3. Follow each import at the top of the file: `transformOn` from `./transforms/vOn`, `transformBind` from `./transforms/vBind`, `transformModel` from `./transforms/vModel`.

## Why other files are wrong
- `vIf.ts`, `vFor.ts`, `vOnce.ts`, `vMemo.ts` and `vSlot.ts` supply entries for the node-transform array (structural directives and slot tracking), not the directive-transform record.
- `packages/compiler-dom/src/transforms/vOn.ts` and `vModel.ts` are DOM overrides registered in a different package, not under `compiler-core`.
