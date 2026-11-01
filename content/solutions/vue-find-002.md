# vue-find-002: Dropping dependencies a run did not read

**Answer:** `packages/reactivity/src/effect.ts`, lines 334 to 336, the `removeSub(link)` and `removeDep(link)` calls (with the comment between them) inside the `link.version === -1` branch of `cleanupDeps`.

## Path
1. `ReactiveEffect.run` calls `prepareDeps(this)` before the user function and `cleanupDeps(this)` in its `finally` block. `prepareDeps` sets every existing link's `version` to -1. Tracking during the run resets the version of each link it touches, so any link still at -1 afterwards was not read.
2. In `cleanupDeps`, find the `if (link.version === -1)` branch. Its body does two removals: `removeSub(link)` takes the link out of the dep's subscriber list, and `removeDep(link)` takes it out of the effect's own dep list.
3. Those two calls are the anchor. The `tail` adjustment on the first line of the branch is bookkeeping for the list ends, and the `else` branch keeps live links.

## Why other selections are wrong
- Lines in the `else` branch (`head = link`) keep a link, not remove one.
- The code after the loop (`sub.deps = head`, `sub.depsTail = tail`) only stores the new list ends.
