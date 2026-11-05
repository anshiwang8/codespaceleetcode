# vue-find-002: Dropping dependencies a run did not read

**Answer:** `packages/reactivity/src/effect.ts`, lines 334 to 336: the `removeSub(link)` and `removeDep(link)` calls (with the comment between them) inside the `link.version === -1` branch of `cleanupDeps`. A selection is accepted if it covers 334–336 and stays inside 331–337.

## The code

```ts
// packages/reactivity/src/effect.ts:329-347
while (link) {
  const prev = link.prevDep
  if (link.version === -1) {
    if (link === tail) tail = prev
    // unused - remove it from the dep's subscribing effect list
    removeSub(link)
    // also remove it from this effect's dep list
    removeDep(link)
  } else {
    // The new head is the last node seen which wasn't removed
    // from the doubly-linked list
    head = link
  }

  // restore previous active link if any
  link.dep.activeLink = link.prevActiveLink
  link.prevActiveLink = undefined
  link = prev
}
```

Line 334 is `removeSub(link)` and line 336 is `removeDep(link)`. Line 335 is the comment between them, so the minimal selection is 334–336.

## How to navigate there

1. **Find who calls `cleanupDeps`.** It is called once, in the `finally` block of `ReactiveEffect.run` (line 187). Just above, before the user function runs, `run` calls `prepareDeps(this)` (line 172). These two are a pair.

2. **Read `prepareDeps` to learn what -1 means.**

   ```ts
   // packages/reactivity/src/effect.ts:314-317
   for (let link = sub.deps; link; link = link.nextDep) {
     // set all previous deps' (if any) version to -1 so that we can track
     // which ones are unused after the run
     link.version = -1
   ```

3. **Read `Dep.track` to learn how -1 is cleared.** In `packages/reactivity/src/dep.ts`, when a dep is read during the run and the link already exists:

   ```ts
   // packages/reactivity/src/dep.ts:127-129
   } else if (link.version === -1) {
     // reused from last run - already a sub, just sync version
     link.version = this.version
   ```

   So after the run, any link still at -1 was not read.

4. **Find the branch in `cleanupDeps` that handles -1, and pick only the removals.** The prompt asks for the lines that unlink from *both* lists. The two helpers named in the hint are `removeSub` and `removeDep`, defined further down the same file (lines 432 and 472).

## The data structure

Each `Link` sits in two doubly linked lists at once. That is why two removals are needed.

```text
Effect E's dep list (prevDep / nextDep):

    E.deps ──▶ [link E-d1] ⇄ [link E-d2] ⇄ [link E-d3] ◀── E.depsTail

Dep d2's subscriber list (prevSub / nextSub):

    [link X-d2] ⇄ [link E-d2] ⇄ [link Y-d2] ◀── d2.subs (tail)

The same object, link E-d2, is a node in both lists.
```

| Helper | Fields it rewires | List it removes the link from |
|---|---|---|
| `removeSub(link)` | `prevSub`, `nextSub`, and `dep.subs` if the link was the tail | the dep's list of subscribers |
| `removeDep(link)` | `prevDep`, `nextDep` | the effect's list of deps |

`removeSub` also does extra cleanup: it decrements the dep's subscriber count `dep.sc`, and when it reaches zero on a property dep it deletes the dep from its map (lines 463-469). If the dep belongs to a computed that just lost its last subscriber, it soft-unsubscribes the computed from its own deps.

## Why other selections are wrong

| Lines | Code | Why it is not the answer |
|---|---|---|
| 331 | `if (link.version === -1) {` | The condition that detects a stale link, not the unlinking. It is inside the window, so including it is fine, but on its own it misses the anchor. |
| 332 | `if (link === tail) tail = prev` | Moves the local `tail` pointer. Bookkeeping for the list end, not a removal. |
| 333 | comment | Describes `removeSub`. Selecting it with 334–336 is fine, but alone it is not code. |
| 334 only, or 336 only | one of the two removals | The prompt asks for removal from both lists. Each line alone handles only one. |
| 337–341 | `} else { head = link }` | The `else` branch keeps a live link. Selecting 338 or later also falls outside the window. |
| 344–345 | `link.dep.activeLink = link.prevActiveLink` | Restores state that `prepareDeps` saved. Runs for every link, stale or not. |
| 349–350 | `sub.deps = head` / `sub.depsTail = tail` | Stores the new list ends after the loop. |
| `ReactiveEffect.stop`, lines 196-198 | `removeSub(link)` in a loop | Also unlinks deps, but for every dep when the effect is stopped, and it is not in `cleanupDeps`. |

## Why Vue does it this way

An effect's dependencies can change between runs. With `if (flag) read(a) else read(b)`, a run that takes the `else` branch no longer depends on `a`. If the old link stayed, writes to `a` would keep re-running the effect for nothing.

A simpler design would unsubscribe from every dependency before each run and re-subscribe from scratch. The version-marking approach avoids that churn: links that are read again are reused in place (only their `version` is synced), and only the links that were not touched get removed. The loop walks from the tail backwards, which is why `head` ends up as the last surviving link seen.

## Takeaways

- Look for "prepare" and "cleanup" pairs around a run. The prepare step tells you what the marker values mean.
- When a node lives in two linked lists, removing it takes two unlink operations. Expect two helpers.
- For a location answer, select the smallest span that covers the behavior. Here that is the two helper calls and the comment between them.
