# fastapi-find-001: Validating and serializing the endpoint's return value

**Answer:** `fastapi/routing.py#serialize_response`

## How to find it

1. Search `fastapi/routing.py` for `ResponseValidationError`. It is raised in a small number of places; the module-level one is in `serialize_response`.
2. Read the body: `if field:` validates `response_content` with `field.validate(...)` (in a threadpool when the endpoint isn't a coroutine), raises `ResponseValidationError` on errors, and returns `field.serialize` (or `serialize_json`) of the validated value. The `else:` branch returns `jsonable_encoder(response_content)`.
3. Confirm the call site: the inner `app` function of `get_request_handler` calls it after `run_endpoint_function` returns the raw value.

## Why the others are wrong

- `run_endpoint_function` only calls the endpoint (directly or in a threadpool); it does no validation.
- `get_request_handler.app` (the inner request handler) orchestrates dependency solving, endpoint invocation and response creation, and calls `serialize_response`.
- `get_request_handler.app._serialize_data` is a near-lookalike: it is nested inside `get_request_handler`, handles streaming items against `stream_item_field`, and returns JSON bytes. The prompt asks for the module-level function, which excludes it.
