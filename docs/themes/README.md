# Themes

codebases has eight themes, all its own: codebases Light (the default), codebases Dark, and six brand themes authored from the mascot's colors and the illustration plate's cream.

| ID | Name | Scheme | Page | Accent |
| --- | --- | --- | --- | --- |
| `default-light` | codebases Light | light | white | blue |
| `default-dark` | codebases Dark | dark | near-black | blue |
| `cream` | Cream | light | the plate's cream | deep periwinkle |
| `periwinkle-mist` | Periwinkle mist | light | very pale periwinkle | deep periwinkle |
| `mint-mist` | Mint mist | light | very pale mint | teal |
| `ink` | Ink | dark | the mascot's navy ink | periwinkle |
| `dusk` | Dusk | dark | muted deep periwinkle | mint |
| `pine` | Pine | dark | deep desaturated teal | mint |

System is a saved choice too: it follows the device between codebases Light and codebases Dark.

## Where they come from

`web/lib/themes/brand-palettes.ts` holds the six brand palettes: a page color, an accent, body and secondary text, a second surface and an error color each. The colors start from the mascot (`--mascot-*` in `web/app/globals.css`) and the plate. Pages are kept soft and low in chroma, so the plate and the mascot sit well on every one. codebases Light is the fixed token set in `web/lib/themes/derive.ts` (`DEFAULT_LIGHT_TOKENS`, the same values as the stylesheet), and codebases Dark is derived from `DEFAULT_DARK_SOURCE` there.

## How a theme is built

`web/lib/themes/derive.ts` turns each palette into codebases' semantic tokens (`web/lib/themes/tokens.ts`): surfaces, text, lines, accent states, status, difficulty, heatmap, chart, syntax, editor and avatar colors. Every text and state color is moved in lightness, keeping its hue, until it meets its contrast target on every surface it's drawn on:

- Body text: 7:1. Secondary text, accent text, status and difficulty labels, syntax colors, line numbers, and labels on accent and danger buttons: 4.5:1.
- Focus rings, button fills against the page, the strongest heatmap level, and the chart line: 3:1.
- Success is always green and warning amber. Failure keeps the palette's error color when it's red, and is red otherwise. So a palette's accent never stands in for a status.

`web/tests/themes.test.ts` checks every theme against these rules. It also writes `web/lib/themes/catalog.generated.ts` and `MAPPING.md` when run with `UPDATE_THEMES=1`, and fails when they're out of date. To change a theme, change its palette or the derivation, then regenerate:

```sh
cd web && UPDATE_THEMES=1 npx vitest run tests/themes.test.ts
```

`MAPPING.md` lists the eight with their page, text and accent colors and any adjustment the derivation made. Never edit it or the catalog by hand, and never loosen a target: change the palette instead.

## Adding or removing a theme

A theme's ID is what accounts and browsers save, so it's never renamed or reused. `KNOWN_THEME_IDS` in `web/lib/themes/tokens.ts` lists the IDs that exist; the test keeps it equal to the catalog. A saved ID that isn't in that list (a theme from the earlier, larger catalog, for example) reads as codebases Light on the server (`appearanceFrom` in `web/lib/server/settings.ts`), in the browser (`web/lib/themes/controller.ts`) and in the pre-paint script (`web/lib/themes/prepaint.ts`). That check uses only the short list, so it never loads the catalog.
