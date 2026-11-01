# got-trace-001: From flush to timeout timers

**Answer (in order):**

1. `source/core/index.ts#Request.flush`
2. `source/core/index.ts#Request._makeRequest`
3. `source/core/index.ts#Request._onRequest`
4. `source/core/timed-out.ts#timedOut`

## How to get there

1. Open `Request.flush`. After `_attachAbortListener`, `_finalizeBody` and `_canWriteBody` it does `await this._makeRequest();`.
2. `_makeRequest` builds the native request options, picks `function_` (the cache-aware wrapper when the cache is on, otherwise the plain request function), calls it, and then branches. When the result passes `isClientRequest`, it calls `this._onRequest(requestOrResponse, useCache)`. With no cache and a normal `http.request`, that is the branch taken.
3. `_onRequest` calls `timer(request)` (which only records timings) and then `this._cancelTimeouts = timedOut(request, timeout, url)`. `timedOut` is the default export of `source/core/timed-out.ts` and registers the lookup, connect, secure-connect, socket, send and response timers.

## Why other answers are wrong

- `_checkRequestTimeout` is called by `_makeRequest` and also deals with the overall request timeout, but it does not call `timedOut`, so no chain through it reaches the end function.
- `timer` (source/core/utils/timer.ts) is also called from `_onRequest` but records timing events rather than arming timeouts.
- `_onResponse` and `_beforeError` are called from `_onRequest`/`flush` too, but they are not on the way to `timedOut`.
- `_finalizeBody` is called by `flush` before `_makeRequest`; it prepares the body and does not lead to `timedOut`.
