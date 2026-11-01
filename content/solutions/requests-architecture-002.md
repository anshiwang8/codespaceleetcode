# requests-architecture-002: Choosing among mounted adapters

**Answer:** option `c`, the adapter registered under the longest matching prefix.

## How to find it

1. `Session.get_adapter` (`src/requests/sessions.py`) loops over `self.adapters.items()` and returns the first adapter whose prefix the lowercased URL starts with. So the rule depends entirely on the order of `self.adapters`.
2. That order is maintained by `Session.mount`: after storing the new prefix, it finds every existing key shorter than the new prefix (`len(k) < len(prefix)`) and re-inserts it, which moves those shorter keys to the end. Over time the dict is ordered by descending prefix length.
3. `Session.__init__` mounts `https://` then `http://`, so any longer prefix mounted later lands in front of them.
4. First match in descending-length order is the longest matching prefix.

## Why the other options are wrong

- b: mount order doesn't decide. A short prefix mounted later is moved behind longer ones.
- a: same reason; first-mounted wins only by accident when it is also the longest.
- d: `get_adapter` compares the full prefix string with `startswith`, not just the scheme, so host and path parts matter.
