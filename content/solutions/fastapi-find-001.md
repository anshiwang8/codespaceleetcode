# fastapi-find-001: Validating and serializing the endpoint's return value

**Answer:** `fastapi/routing.py#serialize_response`

## How a strong engineer would get there

**Route 1: search for the exception.** The prompt names `ResponseValidationError`. In `fastapi/routing.py` it is raised in only two places: line 343, inside the module-level `serialize_response`, and line 535, inside a function nested in `get_request_handler`. The prompt asks for a module-level function, so line 343 is the one.

**Route 2: follow the request handler.** The hint says the function is called from the inner handler built by `get_request_handler` (line 397). In that inner `app`, the endpoint is run and its return value passed on:

```text
get_request_handler(...).app(request)        line 428
  solve_dependencies(...)                    line 511
  raw_response = run_endpoint_function(...)  line 745
  if isinstance(raw_response, Response):     line 750  returned as-is
  else:
      content = serialize_response(          line 767  <-- the answer
          field=response_field,
          response_content=raw_response, ...)
      response = actual_response_class(content, **response_args)
```

## The function

```python
# fastapi/routing.py:334-360
    if field:
        if is_coroutine:
            value, errors = field.validate(response_content, {}, loc=("response",))
        else:
            value, errors = await run_in_threadpool(
                field.validate, response_content, {}, loc=("response",)
            )
        if errors:
            ctx = endpoint_ctx or EndpointContext()
            raise ResponseValidationError(
                errors=errors,
                body=response_content,
                endpoint_ctx=ctx,
            )
        serializer = field.serialize_json if dump_json else field.serialize
        return serializer(
            value,
            include=include,
            exclude=exclude,
            by_alias=by_alias,
            exclude_unset=exclude_unset,
            exclude_defaults=exclude_defaults,
            exclude_none=exclude_none,
        )

    else:
        return jsonable_encoder(response_content)
```

Every clause of the prompt is visible:

| Prompt | Code |
|---|---|
| "when a response model field is available" | `if field:` (line 334) |
| "validates it against that field" | `field.validate(...)` (line 336 or 338) |
| "raising ResponseValidationError if validation fails" | lines 341-347 |
| "serializes the result" | `field.serialize_json` or `field.serialize` (lines 348-357) |
| "falls back to jsonable_encoder" | `else: return jsonable_encoder(response_content)` (line 360) |

## Where `field` comes from

`field` is the route's `response_field`. `_populate_api_route_state` creates it with `create_model_field(..., mode="serialization")` when the route has a `response_model` (lines 1156-1165), either from `response_model=` or from the endpoint's return annotation (line 1154). Otherwise `response_field` is `None` and the `jsonable_encoder` fallback is used.

The handler also chooses a fast path. When there is a response field and no custom response class, it passes `dump_json=True` (lines 763-765), so `serialize_response` returns JSON bytes from `field.serialize_json` and the handler wraps them in a plain `Response` (lines 780-785) instead of going through `JSONResponse`.

## Why validation runs in a threadpool for sync endpoints

`is_coroutine` tells whether the endpoint was `async def`. For a sync endpoint, `run_endpoint_function` runs the endpoint in a threadpool (lines 373-376), and `serialize_response` validates the same way (lines 337-340), so validation work, which can include user-written validators, stays off the event loop. For async endpoints it validates inline.

## Why the other candidates are wrong

- **`run_endpoint_function`** (line 363). It calls the endpoint, directly or in a threadpool, and returns its raw value. No validation or serialization.
- **`get_request_handler`** and its inner **`app`** (lines 397 and 428). They orchestrate everything (dependencies, endpoint, response building) and *call* `serialize_response`. The inner `app` is also not module-level.
- **`_serialize_data`** (line 528). The closest lookalike: it validates against a field, raises `ResponseValidationError`, and falls back to `jsonable_encoder` (line 550). But it is nested inside `get_request_handler`, works on individual stream items against `stream_item_field`, and returns JSON bytes for JSONL or SSE streams. The prompt asks for a module-level function.
- **`_build_response_args`** (line 379). Module-level and called right next to `serialize_response`, but it only computes the status code and background tasks for the response.
- **`jsonable_encoder`** (`fastapi/encoders.py`). The fallback the prompt mentions. It doesn't validate and it's in another file.
- **`_normalize_non_finite_floats`** (line 309). A module-level helper used for stream output. It doesn't validate.

## Takeaways

- When a prompt names an exception, search for where it is raised. The list of raise sites is usually short, and the prompt's other constraints (module-level, in this file) pick one.
- Nested helpers often duplicate the logic of a module-level function for a special case, here streaming. Use the prompt's scope ("module-level") to tell them apart.
- Response models in FastAPI do two jobs at once: they validate that the endpoint returned the right shape, and they filter the output (`include`, `exclude`, `exclude_unset`). Both happen in this one function.
