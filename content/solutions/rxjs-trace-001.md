# rxjs-trace-001: Subscribing to a BehaviorSubject

**Answer:** `BehaviorSubject._subscribe` -> `PerSubscriptionSubjectBase._subscribe` -> `PerSubscriptionSubjectBase.addSubscriber`

## Path
1. `BehaviorSubject._subscribe` (`behavior-subject.ts`) checks `this.active`, sends the current value with `subscriber.next(...)`, then calls `super._subscribe(subscriber)`.
2. `super._subscribe` is `PerSubscriptionSubjectBase._subscribe` (`per-subscription-subject-base.ts`). For an inactive subject it replays the stored terminal event. For an active one it calls `this.addSubscriber(subscriber)`.
3. `PerSubscriptionSubjectBase.addSubscriber` adds the subscriber to the `#observers` set and registers a teardown that removes it. That is the end of the path.

## Why other candidates are wrong
- `active` is a getter on the base class and is read by both methods. The prompt excludes getters.
- `ReplaySubject._subscribe` calls `addSubscriber` directly, but it is a different class and not on this path.
- `PerSubscriptionSubjectBase.next` fans values out to the observers added here. It does not add observers.
