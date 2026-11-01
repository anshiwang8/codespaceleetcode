# h3-trace-001: From request to JSON body

**Answer (in order):**

1. `src/h3.ts#H3Core."~request"`
2. `src/response.ts#toResponse`
3. `src/response.ts#prepareResponse`
4. `src/response.ts#prepareResponseBody`
5. `src/utils/internal/object.ts#isJSONSerializable`

## How to get there

1. Open `H3Core."~request"` in `src/h3.ts`. It builds the event, runs the handler, then ends with `return toResponse(handlerRes, event, this.config);`.
2. In `src/response.ts`, `toResponse` sees that the value is not thenable, so it takes the synchronous branch and calls `prepareResponse(val, event, config)` inside a `try`.
3. `prepareResponse` handles the sentinels and `Error` values first. A plain object is not a `Response`, so it falls to `prepareResponseBody(val, event, config)`.
4. `prepareResponseBody` tests the value type by type (empty, string, `Uint8Array`, `HTTPResponse`) and then calls `isJSONSerializable(val, valType)`. That is the end condition.

## Why other sequences are wrong

- `H3Core.handler`, `H3Event.<constructor>` and `HTTPError.<constructor>` are also called from `"~request"`, but none of them leads toward `isJSONSerializable`. They are the handler, event setup and the malformed-URL guard.
- `H3Core.fetch` calls `"~request"` but is not the start symbol the prompt names.
- `toError` is called by `toResponse` and `prepareResponse` only for rejected or thrown values, which the prompt rules out.
- Skipping `toResponse` or `prepareResponse` is not possible because each call is a literal call in the previous function's body.
