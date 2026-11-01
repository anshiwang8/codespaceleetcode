# h3-architecture-001: Locking the app on serve

**Answer:** `src/_entries/_common.ts`

## How to get there

1. `serve()` is exported separately from each runtime entry in `src/_entries/` (`node.ts`, `bun.ts`, `deno.ts`, `cloudflare.ts`, `generic.ts`, `service-worker.ts`). Open one.
2. Each `serve` calls `freezeApp(app)` before it hands `app.fetch` to the runtime server. Jump to the definition of `freezeApp`.
3. It is defined in `src/_entries/_common.ts`. It freezes `app.config` and replaces `app["~addRoute"]` with a function that throws "Cannot add routes after the server init". `H3` routes all registration (`on`, `get`, `mount`, ...) through `"~addRoute"`, so this blocks every later registration.

## Why other files are wrong

- Each of the six `src/_entries/*.ts` files only calls `freezeApp`. The prompt asks for the file that defines it.
- `src/h3.ts` defines the original `"~addRoute"` (in `H3Core` and the `H3` override). That is the method being replaced, not the code that installs the restriction.
