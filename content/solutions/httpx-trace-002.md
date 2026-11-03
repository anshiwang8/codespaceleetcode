# httpx-trace-002: Sizing a multipart upload

**Answer:** `Request.__init__` -> `encode_request` -> `encode_multipart_data` -> `MultipartStream.get_headers` -> `MultipartStream.get_content_length`

## How to find it

1. In `Request.__init__` (`httpx/_models.py`), `stream` is `None`, so it calls `encode_request(content=..., data=..., files=..., json=..., boundary=...)`, imported from `httpx/_content.py`.
2. `encode_request` skips the raw-`data` and `content` branches and takes `elif files:`, returning `encode_multipart_data(data or {}, files, boundary)`.
3. `encode_multipart_data` constructs a `MultipartStream` (a constructor, skipped) and then calls `multipart.get_headers()`.
4. `MultipartStream.get_headers` in `httpx/_multipart.py` calls `self.get_content_length()` to choose between a `Content-Length` header and `Transfer-Encoding: chunked`.
5. `get_content_length` loops over the fields, adds the boundary and line-break overhead to each field's length, and returns `None` if any field's length is `None`.

## Why the others are wrong

- `encode_content`, `encode_urlencoded_data` and `encode_json` are the other branches of `encode_request`; with `files=` and no `content`, none of them is taken.
- `MultipartStream.__init__` and `_iter_fields` are reached through the constructor, which the prompt says to skip, and they don't compute any length.
- `FileField.get_length` and `DataField.get_length` measure one part each, and are called by `get_content_length`; the prompt ends at the total for the whole body.
- `Request._prepare` uses the headers that `encode_request` returned, but it runs after `encode_request` has returned, so it isn't on the chain.
