# flask-find-003: Default JSON provider

**Answer:** `src/flask/json/provider.py`

## How to find it

1. Search for `self.json` in `src/flask/`. `src/flask/sansio/app.py` (`App.__init__`) has `self.json: JSONProvider = self.json_provider_class(self)`.
2. `json_provider_class` is a class attribute of `App` assigned `DefaultJSONProvider`, imported at the top of `sansio/app.py` from `..json.provider`.
3. Jump to that definition: `DefaultJSONProvider(JSONProvider)` is in `src/flask/json/provider.py`, where `dumps` and `loads` call the standard-library `json` module.

## Why other files are wrong

- `src/flask/sansio/app.py` only references the class; it neither defines the provider nor does the serialization.
- `src/flask/json/__init__.py` holds the module-level `dumps`, `dump`, `loads`, `load` and `jsonify` helpers, which delegate to `current_app.json`.
- `src/flask/json/tag.py` implements the tagged serializer used for session cookies, a separate mechanism.
