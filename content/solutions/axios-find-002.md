# axios-find-002: When an explicit undefined counts

**Answer:** `lib/core/mergeConfig.js#mergeDirectKeys`

## The key observation

Look at how `mergeConfig` reads the two values before it calls a strategy:

```js
// lib/core/mergeConfig.js:216-221
const merge = utils.hasOwnProp(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
const a = utils.hasOwnProp(config1, prop) ? config1[prop] : undefined;
const b = utils.hasOwnProp(config2, prop) ? config2[prop] : undefined;
const configValue =
  merge === mergeDirectKeys ? merge(a, b, prop, config1, config2) : merge(a, b, prop);
(utils.isUndefined(configValue) && merge !== mergeDirectKeys) || (config[prop] = configValue);
```

For an omitted key and for a key explicitly set to `undefined`, `b` is `undefined` either way. A strategy that only gets `(a, b, prop)` can't tell the two cases apart. Only one strategy is also handed `config1` and `config2`, so only it can ask whether the key is present:

```js
// lib/core/mergeConfig.js:130-136
function mergeDirectKeys(a, b, prop, config1, config2) {
  if (utils.hasOwnProp(config2, prop)) {
    return getMergedValue(a, b);
  } else if (utils.hasOwnProp(config1, prop)) {
    return getMergedValue(undefined, a);
  }
}
```

- **Key omitted:** the first test fails, the second passes, and the default `a` is copied.
- **Key explicitly `undefined`:** the first test passes, and `getMergedValue(a, undefined)` returns `source`, which is `undefined`.

The last line of the excerpt keeps that `undefined`. For every other strategy an `undefined` result is skipped, but `merge !== mergeDirectKeys` makes an exception, so `config[prop] = undefined` is written.

## Checking every strategy

| Strategy | Used for | Omitted key | Explicit `undefined` | Differs? |
|---|---|---|---|---|
| `valueFromConfig2` | `url`, `method`, `data` | absent (default ignored) | absent (default ignored) | no |
| `defaultToConfig2` | `baseURL`, `timeout`, `adapter`, ... | default kept | default kept | no |
| `mergeDeepProperties` | keys not in the table, e.g. `transitional`, `auth` | default kept | default kept | no |
| `mergeHeaders` | `headers` | default kept (via `mergeDeepProperties`) | same | no |
| `mergeParams` | `params` | `copy(undefined, a)` | same, since `utils.isUndefined(b)` | no |
| `mergeDirectKeys` | `validateStatus` | default kept | `undefined` | **yes** |

## How a strong engineer gets there

1. Read the `mergeMap` table (lines 156-188) to see the cast: five named strategies plus the `mergeDeepProperties` fallback.
2. Don't read every strategy line by line. Go straight to where they're called (line 220). The argument lists already differ there, and the next line has a special case for the same function.
3. Confirm by reading `mergeDirectKeys` itself.

## Why axios does this

`validateStatus` is the one key where "turn it off" is a real request. `settle` resolves the promise whenever there's no validator:

```js
// lib/core/settle.js:15-17
const validateStatus = response.config.validateStatus;
if (!response.status || !validateStatus || validateStatus(response.status)) {
  resolve(response);
```

So `axios.get(url, { validateStatus: undefined })` means "never reject on status". With the ordinary strategies, an explicit `undefined` would be ignored like an omitted key, and the default 2xx check would still apply.

The block after the loop (lines 224-234) lets you opt out of this: when the merged transitional option `validateStatusUndefinedResolves` is `false`, an explicit `undefined` falls back to the default again. Its default in `lib/defaults/transitional.js` is `true`, which keeps the behaviour above.

## Why the other candidates are wrong

- **`getMergedValue`:** the shared helper that does the copying for every strategy. It isn't in the table. It never receives `config1` or `config2`, so it can't tell an omitted key from an explicit `undefined`.
- **`getMergedTransitionalOption`:** it reads one transitional flag for the `validateStatus` fix-up after the loop. It isn't a strategy.
- **`valueFromConfig2`:** it also "drops the default", but in *both* cases. For `url`, `method` and `data`, an instance default is never used.
- **`mergeConfig`:** the function that drives the loop, not a strategy.

## Takeaways

- When several functions sit in a dispatch table, look at where they're called. A different argument list at the call site often marks the odd one out.
- `undefined` and "absent" are different in JavaScript only when the code asks with `hasOwnProperty` or `in`. Look for those checks to find where the difference matters.
