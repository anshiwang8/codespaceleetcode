# h3-architecture-003: Callers of callMiddleware

**Answer:**

- `src/h3.ts#createDispatcher`
- `src/rules/middleware.ts#routeRules`

## How to get there

1. Jump to `callMiddleware` in `src/middleware.ts` and run Find All References.
2. Discard the import lines (`src/h3.ts`, `src/rules/middleware.ts`) and the re-export in `src/index.ts`. Inside `src/middleware.ts` it calls itself recursively, but the prompt excludes that file.
3. What remains are two call sites:
   - `createDispatcher` in `src/h3.ts`, in the compat branch for a custom `"~getMiddleware"`: `callMiddleware(event, app["~getMiddleware"](...), routeHandler(route))`, inside the returned closure.
   - `routeRules` in `src/rules/middleware.ts`, inside the returned `routeRulesMiddleware` closure: `callMiddleware(event, routeRuleMiddleware, () => next())`.

## Why other functions are wrong

- `composeMiddleware` and `composeHandler` build chains out of `callLayer` and do not call `callMiddleware`. They are in `src/middleware.ts` anyway.
- `H3Core.handler` reaches the middleware chain through `createDispatcher`'s closure, so it has no `callMiddleware` call of its own.
- The re-export in `src/index.ts` is not a call.
