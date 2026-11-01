# rxjs-architecture-002: A late subscriber after a shared source completes

**Answer:** a, the source is subscribed again through a new Subject.

## Path
1. In `packages/rxjs/src/share.ts`, the destructured config gives `resetOnComplete = true` by default (also `resetOnError` and `resetOnRefCountZero`), and `connector` defaults to `() => new Subject<T>()`.
2. When the source completes, the `complete` handler passed to `source.subscribe` sets `hasCompleted = true`, calls `cancelReset()`, then `handleReset(reset, resetOnComplete)`. With the rule `true`, `handleReset` calls `reset()` right away, which sets `subject = undefined`, `connectionController = undefined`, and clears both flags. Only then does it call `destination.complete()` to complete A.
3. When B subscribes, `destination = subject ??= connector()` creates a fresh Subject, because `subject` was cleared. Since `connectionController` is also cleared, the code after it creates a new `AbortController` and calls `source.subscribe(...)` again. B therefore sees a new run of the source from the start.

## Why the others are wrong
- Completing B immediately would happen only with `resetOnComplete: false`, because then the old completed Subject would be kept.
- `share` has no replay buffer, so B does not get the last value. That is what `shareReplay` or a replay-subject connector add.
- B never attaches to the old Subject, because `reset()` dropped the reference to it.
