# Learn section illustrations

These four pictures are interim vector illustrations for the Learn page's sections, drawn in the
mascot's style until the owner's ChatGPT-generated illustrations are ready.

| File | Scene |
| --- | --- |
| `group-1-480.webp`, `group-1-960.webp` | Read a small program: a printout with one line picked out, and boxes holding values |
| `group-2-480.webp`, `group-2-960.webp` | Navigate a repository: a folder tree as a map, a dotted route through three files |
| `group-3-480.webp`, `group-3-960.webp` | Follow a web request: an envelope on a pipe, through three gates, to a server |
| `group-4-480.webp`, `group-4-960.webp` | Reason about systems: two gears, a storage drum and a stream of dots |

Each is 3:2, at 480 by 320 and 960 by 640. `src/group-<n>.svg` is the vector scene each pair is
rendered from.

## Regenerating

The scenes are composed in `web/scripts/learn-illustrations.mjs` from the mascot's geometry
(`web/components/site/mascot-geometry.ts`) and a few simple props, so the script writes the SVG
files as well as the WebP files. Change a scene in the script, never in the SVG, then run from
`web/`:

```
node scripts/learn-illustrations.mjs
```

## Replacing them

The ChatGPT-generated replacements go at the same paths, with the same names and sizes:
`group-<n>-480.webp` and `group-<n>-960.webp`. Once a section has its replacement, remove that
scene from the script (or stop running it), since running it again would overwrite the new file.
