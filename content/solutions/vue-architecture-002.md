# vue-architecture-002: Where a pre-flush watcher lands in the queue

**Answer:** b, the queue becomes A, P, B.

## Path
1. `queueJob` only skips a job whose own `QUEUED` flag is set. P is a different job and is not queued, so it is not dropped.
2. The tail fast path (`queue.push`) requires `!(job.flags & PRE)`. P has the PRE flag, so it takes the `else` branch: `queue.splice(findInsertionIndex(5), 0, P)`.
3. In `findInsertionIndex(5)` with `flushIndex = -1`, the search starts at `start = 0`, `end = 2`.
   - `middle = 1`: job B has id 5. `5 < 5` is false. `5 === 5` is true, but B has no PRE flag, so the second clause is false and `end = 1`.
   - `middle = 0`: job A has id 2, which is less than 5, so `start = 1`.
   - The loop ends and the index is 1.
4. P is spliced in at index 1, giving A, P, B. A pre job goes before a non-pre job with the same id, so a watcher runs just before its component's update job.

## Why the others are wrong
- A, B, P is what a plain FIFO or the tail fast path would give. The PRE flag is exactly what disables the fast path.
- P, A, B would be right only if the id were smaller than 2.
- A, B would require a dedupe by id, but dedupe is by the `QUEUED` flag on the job itself.
