# fastapi-architecture-003: Where the default error responses come from

**Answer:** `fastapi/exception_handlers.py`

## How to find it

1. In `fastapi/applications.py`, `FastAPI.__init__` builds `self.exception_handlers` from the `exception_handlers` argument and then calls `self.exception_handlers.setdefault(HTTPException, http_exception_handler)`, and the same for `RequestValidationError` and `WebSocketRequestValidationError`. `setdefault` is what keeps a user-supplied handler.
2. Those three handler names are imported at the top of the file from `fastapi.exception_handlers`.
3. `fastapi/exception_handlers.py` defines `http_exception_handler` (a JSON response with the exception's `detail`, or an empty response for status codes that allow no body), `request_validation_exception_handler` (a 422 JSON response built from `exc.errors()`) and `websocket_request_validation_exception_handler` (closes the WebSocket with a policy-violation code).

## Why the other files are wrong

- `fastapi/exceptions.py` defines the exception classes (`HTTPException`, `RequestValidationError`, ...), not the functions that turn them into responses.
- `fastapi/applications.py` registers the defaults but only imports them.
- `tests/test_exception_handlers.py` and the tutorials under `docs_src/` define functions with the same names, but they're outside the `fastapi/` package and are user-side examples.
