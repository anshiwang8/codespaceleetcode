# requests-find-001: Merging request settings with session defaults

**Answer:** `src/requests/sessions.py#merge_setting`

## How to find it

1. Open `src/requests/sessions.py` and look at the module-level functions before the `Session` classes. There are only two: `merge_setting` and `merge_hooks`.
2. Read both bodies. `merge_setting` is the one that does the merge itself: it builds a dict from the session mapping, updates it with the request mapping, then collects keys whose value is `None` and deletes them. That is how a caller can pass `headers={"Accept": None}` to drop a session-level default header.
3. Confirm by following callers: `Session.prepare_request` and `Session.merge_environment_settings` both call it.

## Why the others are wrong

- `merge_hooks` (same file) has special handling for the `"response"` hook list and only delegates to `merge_setting` in the general case; it has no `None`-removal logic of its own.
- `Session.prepare_request` and `Session.merge_environment_settings` are methods that call `merge_setting`; the prompt asks for the function that performs the combination.
