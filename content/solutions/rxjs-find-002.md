# rxjs-find-002: Which AbortSignal the upstream subscription uses

**Answer:** `packages/rxjs/src/util/observable-helpers.ts`, line 38: `{ signal: signal ? AbortSignal.any([subscriber.signal, signal]) : subscriber.signal }`. A selection is accepted if it covers line 38 and stays inside 32–40.

## The code

```ts
// packages/rxjs/src/util/observable-helpers.ts:31-44
try {
  source.subscribe(
    {
      next: guard<[T]>(overrides?.next, (value) => subscriber.next(value)),
      error: handleError,
      complete: guard<[]>(overrides?.complete, () => subscriber.complete()),
    },
    { signal: signal ? AbortSignal.any([subscriber.signal, signal]) : subscriber.signal }
  );
} catch (error) {
  // Subscription setup failures are source failures and therefore follow an
  // overridden source-error path when one is present.
  handleError(error);
}
```

```text
source.subscribe(               line 32
  { next, error, complete },    lines 33-37   ← first argument: the observer
  { signal: ... }               line 38       ← second argument: the options  ◀── answer
);                              line 39
```

## How to navigate there

1. **Open `subscribeToSource`** in `packages/rxjs/src/util/observable-helpers.ts` (line 13). Note the last parameter, `signal?: AbortSignal`. That is "the extra signal" the prompt mentions.
2. **Find `source.subscribe(`.** It is the only call inside the `try` block. Its first argument is an object literal spanning lines 33-37. Its second argument is on one line, 38.
3. **Read line 38.** It is a ternary on the optional parameter:
   - `signal` given: `AbortSignal.any([subscriber.signal, signal])`, a new signal that aborts as soon as *either* input aborts.
   - `signal` not given: `subscriber.signal` as-is.

   Both cases are on the same line, so the single line is the answer.

## Who passes an extra signal, and why

Most operators, such as `filter`, call `subscribeToSource(this, subscriber, { next })` with no fourth argument, so the upstream lives exactly as long as the downstream subscriber. Some operators need to stop the upstream *before* the downstream ends. `single` is one:

```ts
// packages/rxjs/src/single.ts:31-32, 48-50
const sourceController = new AbortController();
subscribeToSource(
...
if (hasValue) {
  sourceController.abort();
  subscriber.error(new SequenceError('Too many matching values'));
```

It passes `sourceController.signal` as the fourth argument (line 71), so line 38 combines it with `subscriber.signal`. Calling `sourceController.abort()` then cancels the upstream immediately, while the downstream subscriber is still alive long enough to receive the error.

| Caller passes `signal`? | Upstream is canceled when |
|---|---|
| no | the downstream subscriber's signal aborts |
| yes | the downstream subscriber's signal aborts, **or** the operator aborts its own controller |

## Why other lines are wrong

| Line(s) | Code | Why it is not the answer |
|---|---|---|
| 32 | `source.subscribe(` | Opens the call. It does not choose a signal. |
| 33-37 | the observer `{ next, error, complete }` | Wires the handlers through `guard`. Nothing about signals. |
| 34 | `next: guard<[T]>(...)` | Chooses between the override and the default `next`. A similar "pick one" shape, but for a handler, not the signal. |
| 39 | `);` | Closes the call. Inside the window, so selecting 38-39 is fine, but 39 alone misses the anchor. |
| 40-44 | `catch (error) { handleError(error); }` | Handles a throw while subscribing. Selecting 41 or later also falls outside the window. |
| 17 | `signal?: AbortSignal` | Declares the parameter. It does not decide which signal is used. |

## Takeaways

- When a call has several arguments spread over many lines, sketch which lines belong to which argument. Answers often hide in a short trailing argument.
- `AbortSignal.any([...])` is the standard way to say "cancel when any of these cancel." Seeing it tells you a component has more than one reason to stop.
- An optional extra parameter combined with a default is a common way to let a few callers opt into stronger behavior without changing the rest.
