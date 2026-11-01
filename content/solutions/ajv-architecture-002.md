# ajv-architecture-002: Block nodes in the code generator

**Answer:**

- `lib/compile/codegen/index.ts#Else`
- `lib/compile/codegen/index.ts#If`
- `lib/compile/codegen/index.ts#For`
- `lib/compile/codegen/index.ts#Func`
- `lib/compile/codegen/index.ts#Try`
- `lib/compile/codegen/index.ts#Catch`
- `lib/compile/codegen/index.ts#Finally`

## How to get there

1. Open `lib/compile/codegen/index.ts` and search for `extends BlockNode`. Each hit is a direct subclass: `Else`, `If`, the abstract `For`, `Func`, `Try`, `Catch` and `Finally`.
2. Check the near misses. `ForLoop`, `ForRange` and `ForIter` extend `For`, not `BlockNode`. `Root` and `Return` extend `ParentNode`, and `BlockNode` itself extends `ParentNode`.

## Why other classes are wrong

- `ForLoop`, `ForRange` and `ForIter` are grandchildren of `BlockNode` (via `For`).
- `Root` and `Return` are siblings of `BlockNode` under `ParentNode`.
- `Def`, `Assign`, `AssignOp`, `Label`, `Break`, `Throw` and `AnyCode` are leaf nodes that extend `Node` (or `Assign`).
