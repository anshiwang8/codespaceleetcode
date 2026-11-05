# vue-architecture-002: Where a pre-flush watcher lands in the queue

**Answer:** b, the queue becomes A, P, B.

## The setup

```text
index:     0          1
queue:   [ A(id 2) ,  B(id 5) ]     both QUEUED, neither PRE
flushIndex = -1                     (no flush running)

queueJob(P)   P: id 5, PRE, not QUEUED
```

Everything you need is in `packages/runtime-core/src/scheduler.ts`: `queueJob` (line 100), `findInsertionIndex` (line 79) and `getId` (line 270).

## Step 1: does `queueJob` accept P at all?

```ts
// packages/runtime-core/src/scheduler.ts:100-101
export function queueJob(job: SchedulerJob): void {
  if (!(job.flags! & SchedulerJobFlags.QUEUED)) {
```

The dedupe check reads the `QUEUED` bit on **the job being queued**, not on anything already in the queue. P's own `QUEUED` bit is clear, so P goes in. The fact that B has the same id does not matter here. Dedupe is per job object, not per id.

## Step 2: fast path or binary search?

```ts
// packages/runtime-core/src/scheduler.ts:102-112
const jobId = getId(job)
const lastJob = queue[queue.length - 1]
if (
  !lastJob ||
  // fast path when the job id is larger than the tail
  (!(job.flags! & SchedulerJobFlags.PRE) && jobId >= getId(lastJob))
) {
  queue.push(job)
} else {
  queue.splice(findInsertionIndex(jobId), 0, job)
}
```

`getId(P)` is 5, since P has an id (`getId` only substitutes -1 or `Infinity` when `id` is `null` or `undefined`). `lastJob` is B, so `!lastJob` is false. The fast path also needs `!(job.flags & PRE)`, which is false for P. So P skips `push` and goes through `findInsertionIndex(5)`.

## Step 3: trace the binary search

```ts
// packages/runtime-core/src/scheduler.ts:79-98
function findInsertionIndex(id: number) {
  let start = flushIndex + 1
  let end = queue.length

  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    if (
      middleJobId < id ||
      (middleJobId === id && middleJob.flags! & SchedulerJobFlags.PRE)
    ) {
      start = middle + 1
    } else {
      end = middle
    }
  }

  return start
}
```

| Iteration | start | end | middle | middleJob | `middleJobId < 5` | `=== 5 && PRE` | Result |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 2 | 1 | B (id 5) | false | false (B is not PRE) | `end = 1` |
| 2 | 0 | 1 | 0 | A (id 2) | true | n/a | `start = 1` |
| exit | 1 | 1 | | | | | return 1 |

`start` begins at `flushIndex + 1 = 0` because no flush is running. `queue.splice(1, 0, P)` inserts P before B, giving **A, P, B**.

## The ordering rule in one line

The search treats a queued job as "before me" if its id is smaller, **or** if its id is equal and it is also a PRE job. So for jobs with the same id:

```text
... [earlier PRE jobs with id 5] [new PRE job] [non-PRE jobs with id 5] ...
```

A new PRE job goes after other PRE jobs with its id (first in, first out among watchers), but before the non-PRE job with that id.

## Why it is designed this way

The comment above `findInsertionIndex` (lines 70-78) explains the intent, and the code backs it up:

- A component's update job has `id = instance.uid` (`renderer.ts:1634`).
- A pre-flush watcher created inside that component gets the same id and the PRE flag (`apiWatch.ts:225-229`).
- Parents are created before children, so smaller ids are parents. Sorting by id updates parents first.

So P is a pre watcher of the component whose update job is B. Putting P immediately before B means the watcher runs right before its component re-renders. The comment's stated goal is that the watcher can be skipped if a parent update earlier in the queue unmounts the component. Part of that machinery is visible here: unmounting stops the component's effect scope and marks its update job `DISPOSED` (`renderer.ts:2393-2399`), and `flushJobs` skips any job with that flag (`scheduler.ts:290`).

## Why the other choices are wrong

| Choice | Why it is wrong |
|---|---|
| a, A, B, P | That is what `queue.push` would produce. It requires the fast path, which needs P to be **non**-PRE. A PRE job always takes the `splice` branch when the queue is not empty. |
| c, A, B (P dropped) | That would need dedupe by id. `queueJob` dedupes by the `QUEUED` flag on the job itself, and P's flag is clear. |
| d, P, A, B | P would go to index 0 only if its id were 2 or smaller. A has id 2, which is less than 5, so the search moves right past it. |

A common slip is to stop at the first iteration: "B has id 5, same as P, so P goes after B." The `=== id` clause only moves right past an equal id when **that queued job** is PRE. B is not, so the search moves left.

## Takeaways

- With a binary search, write out a table of `start`, `end` and `middle`. Two iterations take a minute on paper and remove all guesswork.
- Check what a dedupe key really is. Here it is a bit on the job object, not the job's id.
- Tie-breaking rules in a comparator usually encode a design rule. Find it and the comments around it often explain why.
