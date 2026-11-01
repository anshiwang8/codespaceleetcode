# httpx-architecture-001: Synchronous transport implementations

**Answer:** `HTTPTransport` (`default.py`), `WSGITransport` (`wsgi.py`), `MockTransport` (`mock.py`).

## How to find it

1. List `httpx/_transports/`: `asgi.py`, `base.py`, `default.py`, `mock.py`, `wsgi.py`. `base.py` defines `BaseTransport` and `AsyncBaseTransport`.
2. Read the class headers in each file:
   - `default.py`: `HTTPTransport(BaseTransport)` and `AsyncHTTPTransport(AsyncBaseTransport)`, plus the stream helpers `ResponseStream` / `AsyncResponseStream`.
   - `wsgi.py`: `WSGITransport(BaseTransport)`, plus `WSGIByteStream`.
   - `asgi.py`: `ASGITransport(AsyncBaseTransport)`, plus `ASGIResponseStream`.
   - `mock.py`: `MockTransport(AsyncBaseTransport, BaseTransport)`, which implements both `handle_request` and `handle_async_request`.
3. The sync ones are the three that list `BaseTransport`.

## Why the others are wrong

- `AsyncHTTPTransport` and `ASGITransport` derive only from `AsyncBaseTransport`.
- `ResponseStream`, `WSGIByteStream` and similar derive from byte-stream classes, not transports, and the prompt excludes helpers.
