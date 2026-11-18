# Theme clash list

Written by `web/scripts/theme-clash.mjs` (run `node scripts/theme-clash.mjs` in `web/`). The contact sheet is `theme-clash.png`, in the same order: highest score first.

189 themes scored, 14 removed, 175 kept. A score of 1 or more is a clash.

The test is `clashOf` in `web/lib/themes/clash.ts`, on the page background in OKLCH. Below lightness 0.20 a background never clashes, and neither does a dark one (lightness below 0.50) in the mascot's blue-violet family (hue within 45 degrees of 278). Any other dark background clashes at chroma 0.12 or more; a light warm one (hue within 60 degrees of the plate's 70) at 0.10 or more; any other light one at 0.06 or more. The score is the chroma divided by that limit.

To bring a theme back, delete its line in `web/lib/themes/removed.ts` and run `UPDATE_THEMES=1 npx vitest run tests/themes.test.ts` in `web/`.

The removed list and the test agree on every theme.

| ID | Name | Background | Score | Status | Reason |
| --- | --- | --- | --- | --- | --- |
| `menthol` | Spearmint | `#00d097` | 2.67 | removed | Spearmint: a vivid green page (#00d097) the same mint as the mascot's accent, so the plate reads as a hole and the mint disappears. |
| `evil-eye` | Talisman | `#38bfff` | 2.40 | removed | Talisman: a vivid sky blue page (#38bfff); the cream plate looks dirty on it and the periwinkle goes gray. |
| `deku` | Lagoon | `#07cbcc` | 2.16 | removed | Lagoon: a vivid cyan page (#07cbcc) that fights the mascot's mint and makes the cream plate look yellowed. |
| `miami` | Neon Coast | `#f898b7` | 2.00 | removed | Neon Coast: a saturated pink page (#f898b7) against the mint and periwinkle; three loud colors around a cream card. |
| `honey` | Beeswax | `#f2aa00` | 1.64 | removed | Beeswax: a saturated amber page (#f2aa00); the pale warm plate washes out on it and the periwinkle vibrates. |
| `taro` | Ube | `#b3baff` | 1.63 | removed | Ube: a periwinkle pastel page (#b3baff) close to the mascot's body color, so the mascot merges with the page and the plate looks yellow. |
| `mexican` | Marigold Market | `#f8ad34` | 1.54 | removed | Marigold Market: a saturated orange page (#f8ad34); the pale warm plate washes out on it and the periwinkle vibrates. |
| `vaporwave` | Mall Fountain | `#acafec` | 1.45 | removed | Mall Fountain: a lavender page (#acafec) close to the mascot's body color, so the plate looks yellow and the mascot merges with the page. |
| `frozen-llama` | Glacier Mint | `#9bf2ea` | 1.41 | removed | Glacier Mint: a pale cyan page (#9bf2ea) near the mascot's mint; the cream plate looks dirty on it. |
| `creamsicle` | Orange Pop | `#ff9c6e` | 1.33 | removed | Orange Pop: a saturated orange page (#ff9c6e) against the mint and periwinkle. |
| `our-theme` | Signal Red | `#830b18` | 1.25 | removed | Signal Red: a crimson page (#830b18); the mint and periwinkle on cream clash hard with saturated red. |
| `strawberry` | Berry Patch | `#f69b9e` | 1.09 | removed | Berry Patch: a saturated salmon page (#f69b9e) against the mint and periwinkle. |
| `red-samurai` | Lacquer | `#7c1e29` | 1.06 | removed | Lacquer: a crimson page (#7c1e29); the mint and periwinkle on cream clash with saturated red. |
| `passion-fruit` | Guava | `#782040` | 1.03 | removed | Guava: a magenta-red page (#782040); the mint and periwinkle on cream clash with it. |
| `pink-lemonade` | Lemon Fizz | `#f6d992` | 0.95 | kept | light warm background under the limit of 0.1 (lightness 0.89, chroma 0.095, hue 88) |
| `pastel` | Sorbet | `#e0b2bd` | 0.92 | kept | light background under the limit of 0.06 (lightness 0.81, chroma 0.055, hue 2) |
| `cy-red` | Kernel Panic | `#6e2626` | 0.86 | kept | dark background under the limit of 0.12 (lightness 0.38, chroma 0.103, hue 23) |
| `beach` | Sandbar | `#ffeead` | 0.84 | kept | light warm background under the limit of 0.1 (lightness 0.95, chroma 0.084, hue 95) |
| `mizu` | Shallows | `#afcbdd` | 0.66 | kept | light background under the limit of 0.06 (lightness 0.83, chroma 0.039, hue 236) |
| `darling` | Bubblegum | `#fec8cd` | 0.62 | kept | light warm background under the limit of 0.1 (lightness 0.88, chroma 0.062, hue 12) |
| `macroblank` | Vapor Mint | `#b2d2c8` | 0.61 | kept | light background under the limit of 0.06 (lightness 0.84, chroma 0.037, hue 175) |
| `cafe` | Espresso | `#ceb18d` | 0.59 | kept | light warm background under the limit of 0.1 (lightness 0.78, chroma 0.059, hue 73) |
| `lavender` | Wisteria | `#b8b2ca` | 0.57 | kept | light background under the limit of 0.06 (lightness 0.78, chroma 0.034, hue 297) |
| `blue-dolphin` | Reef | `#003950` | 0.55 | kept | dark background under the limit of 0.12 (lightness 0.32, chroma 0.067, hue 233) |
| `gruvbox-light` | Harvest Light | `#fbf1c7` | 0.55 | kept | light warm background under the limit of 0.1 (lightness 0.96, chroma 0.055, hue 96) |
| `leather` | Saddle | `#d3ac98` | 0.54 | kept | light warm background under the limit of 0.1 (lightness 0.77, chroma 0.054, hue 49) |
| `retrocast` | Broadcast | `#054a4f` | 0.51 | kept | dark background under the limit of 0.12 (lightness 0.37, chroma 0.062, hue 203) |
| `hedge` | Garden Path | `#314725` | 0.51 | kept | dark background under the limit of 0.12 (lightness 0.37, chroma 0.062, hue 135) |
| `blueberry-light` | Bilberry Light | `#dae0f5` | 0.49 | kept | light background under the limit of 0.06 (lightness 0.91, chroma 0.029, hue 273) |
| `fleuriste` | Pressed Fern | `#c6b294` | 0.47 | kept | light warm background under the limit of 0.1 (lightness 0.77, chroma 0.047, hue 78) |
| `botanical` | Greenhouse | `#a1b8b6` | 0.42 | kept | light background under the limit of 0.06 (lightness 0.76, chroma 0.025, hue 190) |
| `matcha-moccha` | Green Tea Latte | `#523525` | 0.41 | kept | dark background under the limit of 0.12 (lightness 0.36, chroma 0.049, hue 50) |
| `watermelon` | Rind | `#1f4437` | 0.41 | kept | dark background under the limit of 0.12 (lightness 0.35, chroma 0.049, hue 168) |
| `bouquet` | Posy | `#173f35` | 0.41 | kept | dark background under the limit of 0.12 (lightness 0.34, chroma 0.049, hue 174) |
| `solarized-dark` | Sunlit Dark | `#002b36` | 0.41 | kept | dark background under the limit of 0.12 (lightness 0.27, chroma 0.049, hue 220) |
| `desert-oasis` | Dune | `#fff2d5` | 0.40 | kept | light warm background under the limit of 0.1 (lightness 0.96, chroma 0.040, hue 87) |
| `slambook` | Notebook | `#fffdde` | 0.40 | kept | light warm background under the limit of 0.1 (lightness 0.99, chroma 0.040, hue 104) |
| `cheesecake` | Berry Tart | `#fdf0d5` | 0.38 | kept | light warm background under the limit of 0.1 (lightness 0.96, chroma 0.038, hue 85) |
| `lil-dragon` | Wyvern | `#ebe1ef` | 0.36 | kept | light background under the limit of 0.06 (lightness 0.92, chroma 0.022, hue 316) |
| `floret` | Marigold Night | `#00272c` | 0.36 | kept | dark background under the limit of 0.12 (lightness 0.25, chroma 0.043, hue 208) |
| `repose-light` | Idle Light | `#efead0` | 0.35 | kept | light warm background under the limit of 0.1 (lightness 0.93, chroma 0.035, hue 98) |
| `olive` | Field Notes | `#e9e5cc` | 0.33 | kept | light warm background under the limit of 0.1 (lightness 0.92, chroma 0.033, hue 100) |
| `breeze` | Driftwood | `#e8d5c4` | 0.31 | kept | light warm background under the limit of 0.1 (lightness 0.88, chroma 0.031, hue 64) |
| `peaches` | Clay Pot | `#e0d7c1` | 0.31 | kept | light warm background under the limit of 0.1 (lightness 0.88, chroma 0.031, hue 88) |
| `bingsu` | Shaved Ice | `#c1b2b5` | 0.29 | kept | light background under the limit of 0.06 (lightness 0.78, chroma 0.018, hue 4) |
| `godspeed` | Fair Weather | `#eae4cf` | 0.29 | kept | light warm background under the limit of 0.1 (lightness 0.92, chroma 0.029, hue 94) |
| `copper` | Bronze Age | `#442f29` | 0.27 | kept | dark background under the limit of 0.12 (lightness 0.33, chroma 0.033, hue 37) |
| `witch-girl` | Potion | `#f3dbda` | 0.27 | kept | light warm background under the limit of 0.1 (lightness 0.91, chroma 0.027, hue 21) |
| `shoko` | Overcast | `#ced7e0` | 0.26 | kept | light background under the limit of 0.06 (lightness 0.87, chroma 0.016, hue 248) |
| `tangerine` | Clementine | `#ffede0` | 0.26 | kept | light warm background under the limit of 0.1 (lightness 0.96, chroma 0.026, hue 58) |
| `solarized-light` | Sunlit Light | `#fdf6e3` | 0.26 | kept | light warm background under the limit of 0.1 (lightness 0.97, chroma 0.026, hue 90) |
| `retro` | Typewriter | `#dad3c1` | 0.25 | kept | light warm background under the limit of 0.1 (lightness 0.87, chroma 0.025, hue 89) |
| `terror-below` | Undertow | `#0b1e1a` | 0.22 | kept | dark background under the limit of 0.12 (lightness 0.22, chroma 0.026, hue 178) |
| `froyo` | Soft Serve | `#e1dacb` | 0.22 | kept | light warm background under the limit of 0.1 (lightness 0.89, chroma 0.022, hue 86) |
| `hanok` | Tea House | `#d8d2c3` | 0.21 | kept | light warm background under the limit of 0.1 (lightness 0.86, chroma 0.021, hue 89) |
| `dollar` | Greenback | `#e4e4d4` | 0.21 | kept | light warm background under the limit of 0.1 (lightness 0.91, chroma 0.021, hue 107) |
| `tiramisu` | Cocoa Dust | `#cfc6b9` | 0.20 | kept | light warm background under the limit of 0.1 (lightness 0.83, chroma 0.020, hue 77) |
| `camping` | Trailhead | `#faf1e4` | 0.20 | kept | light warm background under the limit of 0.1 (lightness 0.96, chroma 0.020, hue 77) |
| `terrazzo` | Mosaic | `#f1e5da` | 0.20 | kept | light warm background under the limit of 0.1 (lightness 0.93, chroma 0.020, hue 65) |
| `lime` | Citrus Slate | `#adb4b9` | 0.18 | kept | light background under the limit of 0.06 (lightness 0.77, chroma 0.011, hue 239) |
| `wavez` | Tidepool | `#1c292f` | 0.17 | kept | dark background under the limit of 0.12 (lightness 0.27, chroma 0.021, hue 228) |
| `tron-orange` | Hazard | `#0d1c1c` | 0.17 | kept | dark background under the limit of 0.12 (lightness 0.21, chroma 0.021, hue 196) |
| `material` | Slate Teal | `#263238` | 0.16 | kept | dark background under the limit of 0.12 (lightness 0.31, chroma 0.019, hue 230) |
| `graen` | Moss | `#303c36` | 0.16 | kept | dark background under the limit of 0.12 (lightness 0.34, chroma 0.019, hue 164) |
| `mr-sleeves` | Cardigan | `#d1d7da` | 0.13 | kept | light background under the limit of 0.06 (lightness 0.88, chroma 0.008, hue 229) |
| `9009` | Paperback | `#eeebe2` | 0.12 | kept | light warm background under the limit of 0.1 (lightness 0.94, chroma 0.012, hue 92) |
| `nord-light` | Fjord Light | `#eceff4` | 0.12 | kept | light background under the limit of 0.06 (lightness 0.95, chroma 0.007, hue 261) |
| `soaring-skies` | Kite | `#fff9f2` | 0.11 | kept | light warm background under the limit of 0.1 (lightness 0.98, chroma 0.011, hue 72) |
| `rose-pine-dawn` | Morning Garden | `#fffaf3` | 0.11 | kept | light warm background under the limit of 0.1 (lightness 0.99, chroma 0.011, hue 77) |
| `everblush` | Evergreen Night | `#141b1e` | 0.10 | kept | dark background under the limit of 0.12 (lightness 0.22, chroma 0.012, hue 226) |
| `lilac-mist` | Orchid | `#fffbfe` | 0.10 | kept | light background under the limit of 0.06 (lightness 0.99, chroma 0.006, hue 334) |
| `snes` | Cartridge | `#bfbec2` | 0.09 | kept | light background under the limit of 0.06 (lightness 0.80, chroma 0.006, hue 298) |
| `monokai` | Highlighter | `#272822` | 0.09 | kept | dark background under the limit of 0.12 (lightness 0.27, chroma 0.011, hue 115) |
| `fruit-chew` | Taffy | `#d6d3d6` | 0.09 | kept | light background under the limit of 0.06 (lightness 0.87, chroma 0.005, hue 326) |
| `cyberspace` | Mainframe | `#181c18` | 0.08 | kept | dark background under the limit of 0.12 (lightness 0.22, chroma 0.010, hue 145) |
| `viridescent` | Verdigris | `#2c3333` | 0.08 | kept | dark background under the limit of 0.12 (lightness 0.31, chroma 0.010, hue 197) |
| `earthsong` | Topsoil | `#292521` | 0.08 | kept | dark background under the limit of 0.12 (lightness 0.27, chroma 0.009, hue 67) |
| `iceberg-light` | Floe Light | `#e8e9ec` | 0.07 | kept | light background under the limit of 0.06 (lightness 0.93, chroma 0.004, hue 271) |
| `serika` | Gold Leaf Light | `#e1e1e3` | 0.04 | kept | light background under the limit of 0.06 (lightness 0.91, chroma 0.003, hue 286) |
| `dmg` | Handheld | `#dadbdc` | 0.03 | kept | light background under the limit of 0.06 (lightness 0.89, chroma 0.002, hue 248) |
| `fundamentals` | Primitives | `#3f4141` | 0.02 | kept | dark background under the limit of 0.12 (lightness 0.37, chroma 0.003, hue 197) |
| `oblivion` | Null Pointer | `#313231` | 0.02 | kept | dark background under the limit of 0.12 (lightness 0.32, chroma 0.002, hue 146) |
| `bliss` | Soft Landing | `#262727` | 0.01 | kept | dark background under the limit of 0.12 (lightness 0.27, chroma 0.001, hue 197) |
| `default-light` | codebases Light | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `dino` | Fern | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `magic-girl` | Sparkle | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `milkshake` | Malt | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `modern-ink` | Red Pen | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `ms-cupcakes` | Frosting | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `sewing-tin-light` | Thimble Light | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `vesper-light` | Ember Light | `#ffffff` | 0.00 | kept | light background under the limit of 0.06 (lightness 1.00, chroma 0.000, hue 0) |
| `rainbow-trail` | Prism | `#f5f5f5` | 0.00 | kept | light background under the limit of 0.06 (lightness 0.97, chroma 0.000, hue 0) |
| `paper` | Newsprint | `#eeeeee` | 0.00 | kept | light background under the limit of 0.06 (lightness 0.95, chroma 0.000, hue 0) |
| `modern-dolch-light` | Seafoam Light | `#dbdbdb` | 0.00 | kept | light background under the limit of 0.06 (lightness 0.89, chroma 0.000, hue 0) |
| `iv-clover` | Card Table | `#b4b4b4` | 0.00 | kept | light background under the limit of 0.06 (lightness 0.77, chroma 0.000, hue 0) |
| `dualshot` | Controller | `#404040` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.37, chroma 0.000, hue 0) |
| `muted` | Low Volume | `#404040` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.37, chroma 0.000, hue 0) |
| `carbon` | Graphite Ember | `#313131` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.31, chroma 0.000, hue 0) |
| `peach-blossom` | Apricot Dusk | `#292929` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.28, chroma 0.000, hue 0) |
| `gruvbox-dark` | Harvest Dark | `#282828` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.28, chroma 0.000, hue 0) |
| `metaverse` | Render Farm | `#232323` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.26, chroma 0.000, hue 0) |
| `night-runner` | Night Shift | `#212121` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.25, chroma 0.000, hue 0) |
| `ishtar` | Clay Tablet | `#202020` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.24, chroma 0.000, hue 0) |
| `dark-note` | Footnote | `#1f1f1f` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.24, chroma 0.000, hue 0) |
| `vscode` | Status Bar | `#1e1e1e` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.24, chroma 0.000, hue 0) |
| `alduin` | Ashen Scroll | `#1c1c1c` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.23, chroma 0.000, hue 0) |
| `pulse` | Oscilloscope | `#181818` | 0.00 | kept | dark background under the limit of 0.12 (lightness 0.21, chroma 0.000, hue 0) |
| `8008` | Hotfix | `#333a45` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.35, chroma 0.021, hue 259) |
| `80s-after-dark` | Arcade Night | `#1b1d36` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.048, hue 279) |
| `aether` | Ether | `#101820` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.21, chroma 0.020, hue 249) |
| `alpine` | Snowline | `#413f4d` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.38, chroma 0.024, hue 292) |
| `anti-hero` | Midnight Caper | `#00002e` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.14, chroma 0.094, hue 264) |
| `arch` | Bare Metal | `#0c0d11` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.16, chroma 0.009, hue 274) |
| `aurora` | Polar Lights | `#011926` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.20, chroma 0.041, hue 235) |
| `bento` | Lunchbox | `#2d394d` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.34, chroma 0.039, hue 260) |
| `blueberry-dark` | Bilberry Dark | `#212b42` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.29, chroma 0.045, hue 266) |
| `bushido` | Ronin | `#242933` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.28, chroma 0.020, hue 264) |
| `catppuccin` | Night Latte | `#1e1e2e` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.030, hue 284) |
| `chaos-theory` | Entropy | `#141221` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.19, chroma 0.030, hue 289) |
| `cherry-blossom` | Petal Fall | `#323437` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.32, chroma 0.006, hue 258) |
| `comfy` | Cozy Shell | `#354250` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.37, chroma 0.030, hue 251) |
| `dark` | Monochrome | `#111111` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.18, chroma 0.000, hue 0) |
| `dark-magic-girl` | Spellbook | `#091f2c` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.23, chroma 0.038, hue 237) |
| `default-dark` | codebases Dark | `#0f141b` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.19, chroma 0.016, hue 257) |
| `dev` | Localhost | `#1b2028` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.017, hue 260) |
| `diner` | Short Order | `#2f4455` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.38, chroma 0.039, hue 243) |
| `discord` | Chatroom | `#313338` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.32, chroma 0.009, hue 268) |
| `dots` | Pixel Grid | `#121520` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.20, chroma 0.023, hue 272) |
| `dracula` | Nocturne | `#282a36` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.29, chroma 0.022, hue 278) |
| `drowning` | Deep Water | `#191826` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.22, chroma 0.027, hue 287) |
| `ez-mode` | Tutorial | `#00427f` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.38, chroma 0.119, hue 253) |
| `fire` | Furnace | `#0f0000` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.11, chroma 0.043, hue 29) |
| `fledgling` | Rosewood | `#3b363f` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.34, chroma 0.017, hue 310) |
| `future-funk` | Synthwave | `#2e1a47` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.27, chroma 0.082, hue 302) |
| `github` | Merge Commit | `#212830` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.27, chroma 0.018, hue 252) |
| `grand-prix` | Pit Lane | `#324256` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.37, chroma 0.040, hue 254) |
| `grape` | Concord | `#2c003e` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.22, chroma 0.110, hue 313) |
| `hammerhead` | Deep Sea | `#030613` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.13, chroma 0.032, hue 267) |
| `horizon` | Dusk Line | `#1c1e26` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.016, hue 274) |
| `husqy` | Violet Static | `#000000` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.00, chroma 0.000, hue 0) |
| `iceberg-dark` | Floe Dark | `#161821` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.21, chroma 0.018, hue 275) |
| `incognito` | Private Mode | `#0e0e0e` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.16, chroma 0.000, hue 0) |
| `iv-spade` | High Stakes | `#0c0c0c` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.15, chroma 0.000, hue 0) |
| `joker` | Wildcard | `#1a0e25` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.19, chroma 0.047, hue 307) |
| `laser` | Beam | `#221b44` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.26, chroma 0.074, hue 288) |
| `luna` | Night Bloom | `#221c35` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.25, chroma 0.047, hue 294) |
| `mashu` | Shield Wall | `#2b2b2c` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.29, chroma 0.002, hue 286) |
| `matrix` | Green Rain | `#000000` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.00, chroma 0.000, hue 0) |
| `metropolis` | Skyline | `#0f1f2c` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.23, chroma 0.033, hue 244) |
| `miami-nights` | After Hours | `#18181a` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.21, chroma 0.004, hue 286) |
| `midnight` | Graveyard Shift | `#0b0e13` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.16, chroma 0.012, hue 261) |
| `mint` | Harbor Mint | `#05385b` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.33, chroma 0.079, hue 245) |
| `modern-dolch` | Seafoam Dark | `#2d2e30` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.30, chroma 0.004, hue 265) |
| `moonlight` | Lamplight | `#191f28` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.020, hue 258) |
| `mountain` | Bedrock | `#0f0f0f` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.17, chroma 0.000, hue 0) |
| `nautilus` | Submarine | `#132237` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.25, chroma 0.045, hue 257) |
| `nebula` | Stardust | `#212135` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.26, chroma 0.037, hue 283) |
| `nord` | Fjord Dark | `#242933` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.28, chroma 0.020, hue 264) |
| `norse` | Rune Stone | `#242425` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.26, chroma 0.002, hue 286) |
| `olivia` | Rose Quartz | `#1c1b1d` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.22, chroma 0.004, hue 308) |
| `onedark` | Workbench | `#2f343f` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.32, chroma 0.021, hue 266) |
| `pale-nimbus` | Mint Cloud | `#433e4c` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.37, chroma 0.024, hue 302) |
| `phantom` | Specter | `#000011` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.08, chroma 0.056, hue 264) |
| `purpleish` | Ultraviolet | `#1e1e32` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.25, chroma 0.038, hue 283) |
| `red-dragon` | Firebrand | `#1a0b0c` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.17, chroma 0.026, hue 16) |
| `repose-dark` | Idle Dark | `#2f3338` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.32, chroma 0.011, hue 254) |
| `rgb` | Spectrum | `#111111` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.18, chroma 0.000, hue 0) |
| `rose-pine` | Twilight Garden | `#1f1d27` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.019, hue 294) |
| `rose-pine-moon` | Moonlit Garden | `#2a273f` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.29, chroma 0.043, hue 289) |
| `rudy` | Brass Compass | `#1a2b3e` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.28, chroma 0.042, hue 252) |
| `ryujinscales` | Koi | `#081426` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.19, chroma 0.041, hue 258) |
| `serika-dark` | Gold Leaf Dark | `#323437` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.32, chroma 0.006, hue 258) |
| `sewing-tin` | Thimble Dark | `#241963` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.28, chroma 0.123, hue 282) |
| `shadow` | Blackout | `#000000` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.00, chroma 0.000, hue 0) |
| `solarized-osaka` | Sunlit Midnight | `#00141a` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.18, chroma 0.032, hue 218) |
| `sonokai` | Fieldwork | `#2c2e34` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.30, chroma 0.011, hue 271) |
| `spiderman` | Red Alert | `#0d1219` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.18, chroma 0.016, hue 257) |
| `stealth` | Dark Matter | `#010203` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.08, chroma 0.008, hue 241) |
| `striker` | Kickoff | `#104176` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.37, chroma 0.104, hue 254) |
| `suisei` | Comet | `#354358` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.38, chroma 0.040, hue 258) |
| `sunset` | Golden Hour | `#211e24` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.24, chroma 0.012, hue 308) |
| `superuser` | Root Shell | `#262a33` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.28, chroma 0.018, hue 266) |
| `sweden` | Archipelago | `#00427a` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.38, chroma 0.112, hue 252) |
| `terminal` | TTY | `#191a1b` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.22, chroma 0.002, hue 248) |
| `terra` | Canopy | `#0c100e` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.17, chroma 0.008, hue 164) |
| `trackday` | Checkered Flag | `#3a3f54` | 0.00 | kept | dark background in the mascot's own blue-violet family (lightness 0.37, chroma 0.037, hue 274) |
| `trance` | Rave | `#00021b` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.11, chroma 0.062, hue 264) |
| `vesper` | Ember Glow | `#101010` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.17, chroma 0.000, hue 0) |
| `voc` | Velvet | `#190618` | 0.00 | kept | near black, where chroma doesn't read as a color (lightness 0.17, chroma 0.047, hue 329) |
