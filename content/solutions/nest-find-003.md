# nest-find-003: Who makes the module token

**Answer:** `packages/core/injector/opaque-key-factory/by-reference-module-opaque-key-factory.ts`

## How to get there
1. In `NestContainer.addModule` (`packages/core/injector/container.ts`), the token comes from `await this.moduleCompiler.compile(metatype)`.
2. Jump to `ModuleCompiler.compile` in `packages/core/injector/compiler.ts`. It calls `this._moduleOpaqueKeyFactory.createForDynamic(...)` or `createForStatic(...)`. The field is typed as the `ModuleOpaqueKeyFactory` interface and comes in through the constructor, so this file doesn't say which class is used.
3. Find where `ModuleCompiler` is constructed: the `NestContainer` constructor. It picks the factory with `this._contextOptions?.moduleIdGeneratorAlgorithm === 'deep-hash' ? new DeepHashedModuleOpaqueKeyFactory() : new ByReferenceModuleOpaqueKeyFactory({...})`.
4. `NestFactory.create` passes its options straight to `new NestContainer(applicationConfig, appOptions)`. With no options, `moduleIdGeneratorAlgorithm` is `undefined`, so the container takes the `ByReferenceModuleOpaqueKeyFactory` branch. Its `getOrCreateModuleId` builds the token string, and the import at the top of `container.ts` points to its file.

## Why the others are wrong
- `deep-hashed-module-opaque-key-factory.ts` defines `DeepHashedModuleOpaqueKeyFactory`, which is used only when `moduleIdGeneratorAlgorithm` is `'deep-hash'`.
- `interfaces/module-opaque-key-factory.interface.ts` only declares the `ModuleOpaqueKeyFactory` interface. It has no implementation.
- `compiler.ts` defines `ModuleCompiler`, which asks the factory for the token but doesn't build it.
- `container.ts` chooses the factory and stores the token, but the string is built elsewhere.
