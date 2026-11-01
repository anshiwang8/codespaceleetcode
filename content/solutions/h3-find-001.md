# h3-find-001: HEAD falls back to GET

**Answer:** lines 255-259 of `src/h3.ts`, the `if (match === undefined && _event.req.method === "HEAD") { ... }` block inside the `H3` class's `"~findRoute"` override.

## How to get there

1. `H3Core` in `src/h3.ts` declares `"~findRoute"` as an empty hook. The prompt talks about "the router lookup for the H3 app class", so look for the override in the `H3` class further down the same file.
2. The override calls rou3's `findRoute` with the request method and pathname. Right after that call, the only branch that mentions `"HEAD"` is the one that retries with `"GET"`.
3. Select the whole block, from the `if` line to its closing brace. The `return findRoute(...)` line is the part that actually performs the second lookup, and the comment lines inside it are part of the block.

## Why other selections are wrong

- Selecting only the first `findRoute` call (line 254) is the primary lookup for the request's own method, not the fallback.
- Selecting only the `return` line leaves out the condition. The anchor requires the full `if` block, and the window is only a few lines around it, so selecting the whole function fails too.
- `nullBody()` in `src/response.ts` is where the HEAD response body is stripped. That is a different step of HEAD handling and not the lookup.
