# Themes

codebases has 189 themes: its own default light and default dark themes, and 187 themes adapted from the color palettes of Monkeytype's preset themes.

## Source and attribution

The 187 adapted themes start from the preset palettes in Monkeytype, a typing-test site by the Monkeytype contributors, at commit [`0e07023d4a7af1d0c2d8497afdff30eaff615279`](https://github.com/monkeytypegame/monkeytype/tree/0e07023d4a7af1d0c2d8497afdff30eaff615279) (`frontend/src/ts/constants/themes.ts`), read on 2026-11-06. Monkeytype is licensed under GPL-3.0. codebases isn't affiliated with or endorsed by Monkeytype, and these aren't Monkeytype themes. Only the palette colors are used, as a starting point. No names, logos, CSS effects, images or code from Monkeytype are used. 52 of the source presets also ship custom CSS effects (gradients, animations, images); none of those are reproduced.

`monkeytype-presets.json` holds the source colors (background, main, caret, sub, sub-alt, text and four error colors per preset). It was extracted by reading the file as text, without running it. It's development input only and is never sent to browsers.

## How a theme is built

`web/lib/themes/derive.ts` turns each source palette into codebases' 55 semantic tokens (`web/lib/themes/tokens.ts`): surfaces, text, lines, accent states, status, difficulty, heatmap, chart, syntax, editor and avatar colors. Every text and state color is moved in lightness, keeping its hue, until it meets its contrast target on every surface it's drawn on:

- Body text: 7:1. Secondary text, accent text, status and difficulty labels, syntax colors, line numbers, and labels on accent and danger buttons: 4.5:1.
- Focus rings, button fills against the page, the strongest heatmap level, and the chart line: 3:1.
- Success is always green and warning amber. Failure keeps the source's error color when it's red, and is red otherwise. So a palette's accent never stands in for a status.

`web/tests/themes.test.ts` checks every theme against these rules. It also writes `web/lib/themes/catalog.generated.ts` and `MAPPING.md` when run with `UPDATE_THEMES=1`, and fails when they're out of date. To change a theme, change the source palette, the derivation or a name, then regenerate:

```sh
cd web && UPDATE_THEMES=1 npx vitest run tests/themes.test.ts
```

`MAPPING.md` lists every source preset, its codebases ID and name, and the adjustments made to meet the targets.
