# nest-architecture-002: A request-scoped global interceptor

**Answer:** b, the `InstanceWrapper` is passed to `ApplicationConfig.addGlobalRequestInterceptor`.

## Path
1. `DependenciesScanner.insertProvider` sees a custom provider (it has a `provide` key) whose token, `APP_INTERCEPTOR`, is a key of `getApplyProvidersMap()`. No explicit `scope` is set on the provider object, so it calls `getClassScope(useClass)`, which reads the `@Injectable` options and returns `Scope.REQUEST`.
2. It records `{ type, moduleKey, providerKey, scope }` in `applicationProvidersApplyMap`. Because `isRequestOrTransient(scope)` is true, the rewritten provider is registered with `container.addInjectable(...)` instead of `addProvider`.
3. `applyApplicationProviders` loops over that map. For an entry whose scope is request or transient it takes the wrapper from the module's `injectables` and returns `applyRequestProvidersMap[type](instanceWrapper)`. For `APP_INTERCEPTOR` that map entry calls `applicationConfig.addGlobalRequestInterceptor(wrapper)`.
4. The exceptions in this method are thrown only on the static path: `RequestScopedGlobalEnhancerException` when a static enhancer has a request-scoped dependency tree, and `UninstantiatedGlobalEnhancerException` when a static one was never instantiated. The request-scoped branch returns before reaching them.

## Why the others are wrong
- `addGlobalInterceptor` takes a shared instance and is used only for static enhancers.
- The exception applies to a provider that is registered as static but depends on a request-scoped provider.
- Request-scoped global enhancers are supported through the separate `addGlobalRequest*` methods.
