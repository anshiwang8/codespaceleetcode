# unstorage-find-002: The most specific mount wins

**Answer:** `src/storage.ts`, line 545:

```ts
// src/storage.ts:545
context.mountpoints.sort((a, b) => b.length - a.length);
```

## How a strong engineer gets there

1. Start where the prompt points, at the lookup. In `createStorage`, the local `getMount` helper walks `context.mountpoints` and returns on the first prefix match:

   ```ts
   // src/storage.ts:152-161
   const getMount = (key: string) => {
     for (const base of context.mountpoints) {
       if (key.startsWith(base)) {
         return {
           base,
           relativeKey: key.slice(base.length),
           driver: context.mounts[base]!,
         };
       }
     }
   ```

   The first match wins, so getting the right mount depends entirely on the *order* of `context.mountpoints`.

2. Find who writes that array. Searching the file for `mountpoints` gives four places: the initial value `[""]` (line 128), the `push` and the `sort` in `mount` (lines 544-545), and a `filter` in `unmount` (line 569). Only one of them puts the entries in order.

3. In `mount`, every new base is pushed, and then the whole list is sorted by length, longest first:

   ```ts
   // src/storage.ts:543-546
   if (base) {
     context.mountpoints.push(base);
     context.mountpoints.sort((a, b) => b.length - a.length);
   }
   ```

## Worked example

Mount `cache` and then `cache:images`. Bases are normalized with a trailing `:`, so the list goes:

```text
start                     [""]
mount("cache")            ["cache:", ""]
mount("cache:images")     ["cache:images:", "cache:", ""]
```

For the key `cache:images:logo.png`, `getMount` tries `cache:images:` first and it matches, so the more specific driver serves the key as `logo.png`. Without the sort, the order would follow the order of the `mount` calls, and a parent mounted *after* its child would hide it. The root mount `""` has length 0, so it always sorts last and acts as the fallback.

## Why the other candidates are wrong

- **Line 154, `if (key.startsWith(base))`:** this is the matching test. It decides *whether* a mount point matches, not which of two matching mount points is tried first.
- **Line 544, `context.mountpoints.push(base)`:** adds the base at the end. On its own, that would make the *oldest* mount win.
- **Line 128, `mountpoints: [""]`:** only sets up the root mount.
- **`getMounts` (lines 169-180):** `getKeys` and `clear` use it to collect *all* mounts under a base. It keeps the sorted order but doesn't create it.
- **Line 569 in `unmount`:** the `filter` removes one entry and keeps the existing order.

## Takeaways

- When a lookup returns the first match, the real logic is wherever the list gets its order. Find every writer of the list, not just the reader.
- Sorting when a mount is added, rather than on every lookup, is a deliberate trade. Mounts change rarely, and keys are looked up constantly.
