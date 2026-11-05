# zod-find-001: Building the failure result of safeParse

**Answer:** `packages/zod/src/v4/core/parse.ts#failure`

## How to navigate there

1. **Open `_safeParse`** in `packages/zod/src/v4/core/parse.ts` (line 71). It is a factory: it takes an error class and returns the real `safeParse` function. The hint points at the last line of that inner function:

   ```ts
   // packages/zod/src/v4/core/parse.ts:71-79
   export const _safeParse: (_Err: $ZodErrorClass) => $SafeParse = (_Err) => (schema, value, _ctx) => {
     const ctx: schemas.ParseContextInternal = _ctx ? { ..._ctx, async: false } : { async: false };
     const result = schema._zod.run({ value, issues: [] }, ctx);
     if (result instanceof Promise) {
       throw new core.$ZodAsyncError();
     }

     return result.issues.length ? failure(_Err, result.issues, ctx) : ({ success: true, data: result.value } as any);
   };
   ```

   The success result is an inline object literal. The failure result comes from a call to `failure(...)`.

2. **Jump to `failure`** (line 83, same file) and check the "only constructed when first read" part:

   ```ts
   // packages/zod/src/v4/core/parse.ts:83-93
   function failure(Err: $ZodErrorClass, issues: errors.$ZodRawIssue[], ctx: schemas.ParseContextInternal): any {
     let error: errors.$ZodError | undefined;
     return {
       success: false,
       get error() {
         if (!error) {
           error = new Err(issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())));
           // finalizeIssue drops `input`, so the built error holds nothing; keeping the raw issues past this point pins the parsed value for the life of the result
           issues = undefined as any;
           ctx = undefined as any;
         }
         return error;
       },
   ```

   `error` is a getter. The first read builds the error, caches it in the closure variable `error`, and returns the same object on every later read.

## What the returned object looks like

```text
failure(Err, issues, ctx) returns
{
  success: false,
  get error()   first read:  error = new Err(issues.map(finalizeIssue)), drop issues and ctx
                later reads: return the cached error
  set error(e)  store e, drop issues and ctx
}
```

## Why it is built this way

The comment above `failure` (line 82) gives the reasons, and the code backs them up:

- **Cost.** Finalizing each issue (`util.finalizeIssue` resolves the message using `core.config()`) and constructing the error instance are most of the work of a failing parse. Code that only does `if (!result.success) return` never reads `error`, so it never pays that cost.
- **Memory.** Once the error is built, the getter sets `issues` and `ctx` to `undefined`. The comment inside the getter explains that keeping the raw issues would keep the parsed input alive for as long as the result object lives.
- **A setter too.** If a caller assigns `result.error = something`, the setter stores it and drops the captured `issues` and `ctx` as well, since the getter's build branch can no longer run.
- **Trade-off.** The comment notes that a shared accessor descriptor would read about 15% faster but cost about 75 bytes gzipped in every bundle, so the authors chose the getter in the object literal.

Compare `_parse` (line 22), which throws instead of returning a result. It has to build the error eagerly, because the error is the thing it throws:

```ts
// packages/zod/src/v4/core/parse.ts:30-31
if (result.issues.length) {
  const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())));
```

## Why the other candidates are wrong

| Candidate | Why it is wrong |
|---|---|
| `_safeParse` | It calls `failure`, but it does not build the result object itself. It is also the function the prompt starts from. |
| `_safeParseAsync` (line 111) | The async twin. It calls the same `failure` on its last line. It does not define it. |
| `safeParse` (line 80) | A constant, `_safeParse(errors.$ZodRealError)`. It is the configured `_safeParse`, not the builder. |
| `_parse`, `_parseAsync` | They throw an error eagerly and never return a result object with `success: false`. |
| `util.finalizeIssue` (`core/util.ts:971`) | Called inside the getter to shape each issue. It does not build the result object and is in a different file. |
| `$ZodError` / `$ZodRealError` (`core/errors.ts`) | The error class passed in as `Err`. It is constructed by `failure`, it is not the function the prompt asks for. |
| `classic/parse.ts` `safeParse` | The classic API re-exports `core._safeParse(ZodRealError)`. It is in another file and builds nothing itself. |
| `failure` in `packages/resolution/src/index.ts` | A local constant in a module-resolution check script in another package. It holds `JSON.stringify(schema.safeParse(...))`. It is unrelated to `_safeParse`. |

## Takeaways

- When a function returns `cond ? helper(...) : { ... }`, the two branches are often built very differently. Read the helper.
- Lazy getters (`get x() { if (!cached) cached = build(); return cached }`) are a common way to make an expensive field free when nobody reads it. Watch for them in hot paths.
- Factories that take a class and return a function (`_safeParse(_Err)`) let one implementation serve several APIs with different error classes. The real logic is in the returned inner function.
