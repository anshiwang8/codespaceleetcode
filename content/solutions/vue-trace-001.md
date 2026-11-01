# vue-trace-001: From baseCompile into the AST walk

**Answer:** `baseCompile` -> `transform` -> `traverseNode` -> `traverseChildren`

## Path
1. `baseCompile` (`packages/compiler-core/src/compile.ts`) parses the template with `baseParse`, picks the transform preset, then calls `transform(ast, ...)` and finally `generate(ast, ...)`.
2. `transform` (`packages/compiler-core/src/transform.ts`) builds a context with `createTransformContext`, then calls `traverseNode(root, context)` to run all node transforms over the tree.
3. `traverseNode` runs the node transforms on one node, then switches on the node type. For `ROOT`, `ELEMENT`, `FOR` and `IF_BRANCH` nodes it calls `traverseChildren(node, context)`.
4. `traverseChildren` loops over `parent.children` and calls `traverseNode` on each child. That loop is the end condition.

## Why other candidates are wrong
- `baseParse` and `generate` are called by `baseCompile` too, but they are the parse and codegen stages, not part of the transform walk.
- `createTransformContext` and `createRootCodegen` are called by `transform` but never walk the tree.
- `getBaseTransformPreset` returns the arrays of node transforms; the transforms inside are invoked through the array, not called directly by `traverseNode`.
