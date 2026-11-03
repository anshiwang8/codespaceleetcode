# got-trace-002: From a 503 in stream mode to the retry delay

**Answer (in order):**

1. `source/core/index.ts#Request._onRequest`
2. `source/core/index.ts#Request._onResponse`
3. `source/core/index.ts#Request._onResponseBase`
4. `source/core/index.ts#Request._beforeError`
5. `source/core/calculate-retry-delay.ts#calculateRetryDelay`

## How to get there
1. `Request._onRequest` arms the timers and then registers `request.once(responseEventName, response => { void this._onResponse(response); })`. With no cache the event is `'response'`. The callback is inline, so the call counts as part of `_onRequest`.
2. `_onResponse` is a thin wrapper: `await this._onResponseBase(response)` inside a `try`, with `_beforeError` only in its `catch`.
3. `_onResponseBase` prepares the response (`response.ok` is false for 503), decompresses it, and skips the redirect block because there is no `Location` header. Then it reaches `if (options.isStream && options.throwHttpErrors && !isResponseOk(typedResponse)) { this._beforeError(new HTTPError(typedResponse)); return; }`. With `got.stream` and the default `throwHttpErrors`, this is where the 503 becomes an error.
4. `_beforeError` normalizes the error and, because a `retry` listener is attached (`this.listenerCount('retry') !== 0`), calls `calculateRetryDelay({attemptCount, retryOptions, error, retryAfter, computedValue})`.

## Why other paths are wrong
- `_onRequest` -> `_beforeError` -> `calculateRetryDelay` is the tempting shortcut. Those `_beforeError` calls are in the request's `error` listener (through `emitRequestError`) and its `close` listener. They run only when the request itself fails, which the prompt rules out.
- `_onRequest` -> `_sendBody` -> ... -> `_beforeError` is the same trap one level down. `_sendBody`, `_onBodyError` and `_writeBodyInChunks` call `_beforeError` only when writing the request body fails, and a `got.stream` GET sends no body.
- `_onResponse` -> `_beforeError` skips `_onResponseBase`. That call is in `_onResponse`'s `catch`, which runs only if `_onResponseBase` throws. Here `_onResponseBase` calls `_beforeError` itself and returns normally.
- In the promise API the HTTP status check lives in `asPromise` (source/as-promise/index.ts), which calls `request._beforeError` from its `response` listener. A stream request has no promise wrapper, so that code never runs. That is why the `options.isStream` branch in `_onResponseBase` exists.
- `HTTPError` is a constructor, and `isResponseOk` is called from `_onResponseBase` but doesn't lead to `_beforeError`, so neither belongs in the chain.
