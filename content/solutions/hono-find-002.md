# hono-find-002: The no-compose fast path

**Answer:** `src/hono-base.ts`, line 449, the `if (matchResult[0].length === 1)` inside `Hono.#dispatch`. A selection is accepted if it covers line 449 and stays inside lines 447–470.

## How to navigate there

1. **Open the method the prompt names.** In `src/hono-base.ts`, search for `#dispatch(`.

2. **Find the slow path first.** Search the method for `compose(`. There is exactly one call in `#dispatch`, at line 469. Anything that "skips compose" must be a branch that returns before line 469.

3. **Scan upward for an early return.** Between the `Context` construction (line 440) and the `compose` call, there is one `if` block, and it ends with a `return`. Its condition is the answer:

   ```ts
   // src/hono-base.ts:448-449
   // Do not `compose` if it has only one handler
   if (matchResult[0].length === 1) {
   ```

4. **Confirm the meaning of `matchResult[0]`.** The router returns a `Result<T>` (declared in `src/router.ts:98`). Its first element is always the list of matched handlers, each paired with its params. So `matchResult[0].length === 1` means exactly one handler matched.

## The method at a glance

```text
Hono.#dispatch(request, executionCtx, env, method)        src/hono-base.ts:425
├─ if (method === 'HEAD')  → re-dispatch as GET, strip body  :432-435
├─ path = this.getPath(...)                                   :437
├─ matchResult = this.router.match(method, path)              :438
├─ c = new Context(request, {...})                            :440-446
├─ if (matchResult[0].length === 1)   ◀── fast path           :449
│    call matchResult[0][0][0][0](c, next) directly           :452-454
│    return res, or the not-found handler's result            :459-466
└─ composed = compose(matchResult[0], errorHandler, notFound) :469   ◀── slow path
     return (async () => { await composed(c) ... })()         :471-484
```

## What the fast path does differently

The fast path calls the single handler directly:

```ts
// src/hono-base.ts:452-454
res = matchResult[0][0][0][0](c, async () => {
  c.res = await this.#notFoundHandler(c)
})
```

The index chain reads as: first element of the result (the handler list), first entry in that list, the `[handler, routerRoute]` pair at index 0 of that entry, and the handler function at index 0 of the pair. The `next` it passes falls through to the not-found handler, which is what `compose` would have done at the end of the chain.

It also handles both sync and async handlers without forcing an `async` wrapper. If `res` is a `Promise`, it chains `.then` and `.catch`. Otherwise it returns `res ?? this.#notFoundHandler(c)` right away. The slow path, by contrast, always wraps the work in an `async` arrow function.

## Why other lines are wrong

| Line(s) | Code | Why it is not the answer |
|---|---|---|
| 432 | `if (method === 'HEAD') {` | Decides how to treat a HEAD request (re-run as GET and drop the body). It says nothing about the handler count. |
| 438 | `const matchResult = this.router.match(method, path)` | Produces the value the condition tests, but does not branch. |
| 448 | ``// Do not `compose` if it has only one handler`` | A comment. It describes the condition, but the prompt asks for the line that holds it. Selecting 448 together with 449 is fine since both are inside the window. Selecting 448 alone misses the anchor. |
| 459 | `return res instanceof Promise` | Inside the fast path, but it decides sync vs async, not compose vs no compose. |
| 469 | `const composed = compose(...)` | This is the slow path that the condition avoids. |
| 474 | `if (!context.finalized) {` | A check after the composed chain has run. |

## Why Hono does this

`compose` (`src/compose.ts`) returns a closure that builds a recursive `dispatch(i)` function, tracks an index to catch `next()` being called twice, and awaits each handler. For an app where most routes have one handler and no middleware, all of that is overhead on every request. Checking the handler count and calling the handler directly skips that closure and the extra `await`s for the most common case.

## Takeaways

- To find a "fast path", locate the slow path first, then look for an early `return` above it.
- Read data shapes from their type declarations. `Result<T>` in `src/router.ts` explains what `matchResult[0][0][0][0]` means far faster than guessing from the call site.
- Comments like "Do not X if Y" are good search anchors, but the answer must be the code line, not the comment.
