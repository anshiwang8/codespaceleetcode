# vue-design-001: Truncating a reactive array

**Answer:** packages/reactivity/src/dep.ts, lines 339-344. Any selection from line 333 through 347 that covers them is correct.

```ts
// packages/reactivity/src/dep.ts:336-346
    if (targetIsArray && key === 'length') {
      const newLength = Number(newValue)
      depsMap.forEach((dep, key) => {
        if (
          key === 'length' ||
          key === ARRAY_ITERATE_KEY ||
          (!isSymbol(key) && key >= newLength)
        ) {
          run(dep)
        }
      })
```

## The data structure behind it

Every read of a reactive property inside an effect calls `track`, which files the effect under a dep for that exact object and key (lines 262-284). The storage is two levels deep:

```text
targetMap: WeakMap<object, Map<key, Dep>>          (dep.ts:240)
  the array [10, 20, 30, 40]
    0                  -> Dep (effects that read arr[0])
    3                  -> Dep (effects that read arr[3])
    'length'           -> Dep (effects that read arr.length)
    ARRAY_ITERATE_KEY  -> Dep (effects that looped over arr)
```

So when `arr.length = 2` runs, `trigger` gets the array, the key `'length'` and the new value 2, and has to pick deps out of that inner map.

## How to find the lines

`trigger` starts at line 294. After the `CLEAR` case comes the array handling, and its first branch tests `key === 'length'` (line 336). That branch walks every dep the array has, and runs a dep when its key is:

- `'length'`, for effects that read the length;
- `ARRAY_ITERATE_KEY`, for effects that iterated over the array;
- a key that isn't a symbol and is at least `newLength`, which is every index that no longer exists.

Index keys 0 and 1 fail all three tests, so effects that only read those don't run. That's the requirement in the prompt.

## Wrong places to stop

- **Lines 348-356**, the `else` branch: this handles a change to one key, such as `arr[3] = 5`. It runs that key's dep, plus the `ARRAY_ITERATE_KEY` dep for an index.
- **Lines 366-369**, under `TriggerOpTypes.ADD`: the opposite case, a new index making the array longer, which runs the `'length'` dep.
- **Line 331**, `depsMap.forEach(run)`: this runs every dep, but only when a collection is cleared.

## Takeaways

- Tracking dependencies per key, not per object, is what lets a reactive system skip effects that don't care about a change. The cost is that a structural change, like a shorter array, has to be mapped back onto the per-key deps by hand.
- Keying the outer map by object in a `WeakMap` means a reactive object nothing else refers to can be garbage-collected along with its deps.
