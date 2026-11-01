# got-architecture-002: Direct subclasses of RequestError

**Answer:**

- `source/core/errors.ts#MaxRedirectsError`
- `source/core/errors.ts#HTTPError`
- `source/core/errors.ts#CacheError`
- `source/core/errors.ts#UploadError`
- `source/core/errors.ts#TimeoutError`
- `source/core/errors.ts#ReadError`
- `source/core/errors.ts#RetryError`
- `source/core/errors.ts#AbortError`
- `source/core/response.ts#ParseError`

## How to get there

1. Jump to `RequestError` in `source/core/errors.ts` (the base class, which extends `Error`), then search `source/` for `extends RequestError`. Eight matches are in `errors.ts`, and a ninth is `ParseError` in `source/core/response.ts`.
2. Check each match's heritage clause. None of them extends another subclass, so all nine are direct.

## Why other classes are wrong

- `RequestError` itself extends `Error`, not itself.
- `SchemaValidationError` in `errors.ts` deliberately extends `Error` only. Its doc comment says it is not a `RequestError`, and the `extends` clause confirms that.
- `TimeoutError` in `source/core/timed-out.ts` extends `Error`. It is a different class from the `TimeoutError` in `errors.ts`, which does extend `RequestError`, and the answer uses the `errors.ts` one.
- Classes in `source/core/utils/http2-client.ts` (`Http2Agent`, `Http2ClientRequest`, `Http2IncomingMessage`) extend Node stream or event emitter classes.
