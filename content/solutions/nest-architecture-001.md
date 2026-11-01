# nest-architecture-001: Who actually invokes guards, interceptors and pipes

**Answer:**
- `packages/core/guards/guards-consumer.ts`
- `packages/core/interceptors/interceptors-consumer.ts`
- `packages/core/pipes/pipes-consumer.ts`

## Path
1. Start in `packages/core/router/router-execution-context.ts`. `create` builds the request handler and uses helper objects for each enhancer type. `createGuardsFn` calls `GuardsConsumer.tryActivate`, `create` calls `InterceptorsConsumer.intercept`, and `getParamValue` calls `PipesConsumer.apply`.
2. Open each consumer. `GuardsConsumer.tryActivate` calls `guard.canActivate(context)`. `InterceptorsConsumer.intercept` calls `interceptors[i].intercept(context, handler)`. `PipesConsumer.applyPipes` calls `pipe.transform(...)`.
3. These three are the only places in `packages/core/` that call the user's instance directly.

## Why the others are wrong
- `*-context-creator.ts` files (for example `guards-context-creator.ts`) only resolve which enhancers apply to a handler.
- `router-execution-context.ts` and `helpers/external-context-creator.ts` call the consumers, not the user's instances.
- `services/reflector.service.ts` has an `options.transform(...)` call, but that is a metadata option, not a pipe.
