# nest-find-002: Skipping the global module binding

**Answer:** `packages/core/injector/container.ts`, lines 336 to 338: the `if (target === globalModule || target === this.internalCoreModule) { return; }` block in `NestContainer.bindGlobalModuleToModule`.

## Path
1. `DependenciesScanner.scan` ends with `container.bindGlobalScope()`. In `NestContainer`, `bindGlobalScope` calls `bindGlobalsToImports` for every module, which calls `bindGlobalModuleToModule` for every global module.
2. `bindGlobalModuleToModule` starts with a guard. If the target is the global module itself, importing it into itself would be pointless. If the target is the internal core module, it is left alone as well.
3. The guard is the `if`, the `return` and the closing brace. The statement after it, `target.addImport(globalModule)`, is the actual binding.

## Why other selections are wrong
- Only the `target.addImport(globalModule)` line performs the binding. It runs when the guard does not return.
- `bindGlobalScope` and `bindGlobalsToImports` just loop and delegate. They have no early return.
