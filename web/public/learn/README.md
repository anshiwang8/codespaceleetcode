# Learn section illustrations

These four pictures illustrate the Learn page's sections. They were generated with ChatGPT's
image tool from the owner's mascot reference, one per course group, on 2026-11-17.

| File | Scene |
| --- | --- |
| `group-1-480.webp`, `group-1-960.webp` | Read a small program: the mascot tracing one line of a printout, three value boxes beside it |
| `group-2-480.webp`, `group-2-960.webp` | Navigate a repository: a folder above three files joined by a dotted path, the mascot's magnifying glass over the first |
| `group-3-480.webp`, `group-3-960.webp` | Follow a web request: an envelope on a pipe, through three gates (one checked), to a server |
| `group-4-480.webp`, `group-4-960.webp` | Reason about systems: the mascot at a control desk, two gears, a storage drum and a stream of dots |

Each is 3:2, at 480 by 320 and 960 by 640, with a transparent background: the plate behind it
(`.plate` in `app/globals.css`) takes the theme's color, and on dark themes the picture gets a
light edge. The full-size cut-outs are in `docs/superpowers/specs/assets/learn-illustrations/`.

## Replacing one

Generate at 3:2 with the mascot reference attached and the shared style line from section B2 of
`docs/superpowers/specs/2026-11-17-learn-challenges-brand-design.md`, on a plain, flat, light
background. Ask for the code-brackets mark on the cap by name: a bare "no text" makes the model
replace it with stripes. Save the four opaque PNGs as `group-1.png` to `group-4.png` in one
folder, then from `web/`:

```
node scripts/learn-cutout.mjs <that folder> --sheet <preview.png>
```

It cuts away the background connected to the image's edge, softens the cut so no pale fringe
shows on a dark plate, and writes the files here and the full-size cut-outs. Look at the preview
sheet (each picture on a light and a dark plate) before committing. A patch of background color
enclosed by an outline is kept, since some drawings fill the face with that same color.
