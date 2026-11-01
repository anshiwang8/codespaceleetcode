# httpx-architecture-002: Which mounted transport wins

**Answer:** option `d`, the transport mounted for `"https://example.com"`.

## How to find it

1. `Client._transport_for_url` iterates `self._mounts.items()` and returns the first transport whose pattern `matches(url)`. So the iteration order is the rule.
2. At the end of `Client.__init__`, `self._mounts = dict(sorted(self._mounts.items()))` sorts the entries using `URLPattern.__lt__`, which compares `URLPattern.priority`.
3. `priority` (in `httpx/_utils.py`) returns `(port_priority, host_priority, scheme_priority)` with `host_priority = -len(self.host)`. A longer host gives a smaller number, which sorts first. Neither pattern has a port, so the port element ties, and `"example.com"` (11 chars) beats an empty host.
4. So `"https://example.com"` is checked first, and it matches.

## Why the others are wrong

- b: shorter patterns are matched later, not first.
- a, c: insertion order is irrelevant after the sort; the sort key doesn't look at it.
