# nest-trace-001: From scan to a registered provider

**Answer:** `DependenciesScanner.scan` -> `scanModulesForDependencies` -> `reflectProviders` -> `insertProvider` -> `NestContainer.addProvider`

## Path
1. `scan` first calls `registerCoreModule` and `scanForModules` to discover all modules, then calls `scanModulesForDependencies()`.
2. `scanModulesForDependencies` loops over every module in the container and, for each one, calls `reflectImports`, `reflectProviders`, `reflectControllers` and `reflectExports`. Providers are handled by `reflectProviders`.
3. `reflectProviders` reads the `providers` metadata and, in a `forEach` callback, calls `this.insertProvider(provider, token)` for each entry.
4. `insertProvider` checks `isCustomProvider`. For a plain class the check is false, so it returns `this.container.addProvider(provider, token)` right away.
5. `NestContainer.addProvider` (`packages/core/injector/container.ts`) is the end of the trace.

## Why other candidates are wrong
- `scanForModules` and `insertModule` call `NestContainer.addModule`, which creates the module, not its providers.
- `reflectProviders` also calls `reflectDynamicMetadata`, which leads to `insertInjectable` and `NestContainer.addInjectable`. That registers enhancers (guards, pipes and so on), not providers.
- `insertProvider` can also call `addInjectable` for request-scoped enhancer tokens, but that branch is only for custom providers like `APP_GUARD`, which the prompt excludes.
