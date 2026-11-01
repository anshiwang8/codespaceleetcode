# nest-find-001: Where a circular import is reported

**Answer:** `packages/core/scanner.ts#DependenciesScanner.insertImport`

## Path
1. Open `packages/core/scanner.ts` and search for `CircularDependencyException`. It is imported once and used once.
2. The only `throw new CircularDependencyException(context)` is the first statement of `insertImport`, guarded by `isUndefined(related)`. An entry in a module's `imports` array that is `undefined` at scan time usually means two files import each other, so Nest reports it as a circular dependency.
3. The rest of the method handles forward references (`forwardRef()`) and calls `container.addImport`.

## Why the others are wrong
- `reflectImports` loops over the imports and calls `insertImport`, but it does not throw this exception itself.
- `scanForModules` throws other errors (`InvalidModuleException`, `UndefinedModuleException`) for bad module definitions, not this one.
