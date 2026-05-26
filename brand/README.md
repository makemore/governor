# Governor — brand

Single mark: a tick inside a circle. Pre-1.0; expect revisions.

## Why this mark

A tick is the most globally legible "this was approved" symbol. Inside a
circle it reads as a seal — an applied, finished mark of approval. Both
halves are recognised by people who would never use a CLI, which matters:
Governor is a multi-party tool and the non-engineers in those parties
need to see the brand and know what it is for in under a second.

## Files

| File | Use |
|---|---|
| [`mark.svg`](./mark.svg) | The mark, alone. Uses `currentColor`. Drop into anywhere theming should follow the surrounding text colour |
| [`logo.svg`](./logo.svg) | Mark + "Governor" wordmark lockup. Uses `currentColor`. Use anywhere CSS sets text colour (HTML pages, inline `<svg>`). Wordmark uses system fonts; outline the text before any external distribution |
| [`logo-light.svg`](./logo-light.svg), [`logo-dark.svg`](./logo-dark.svg) | Pre-themed logo variants (Slate / Bone). Use these in static rendering contexts that strip CSS — most notably GitHub README `<img>` tags — paired in a `<picture>` element with `prefers-color-scheme` |
| [`favicon.svg`](./favicon.svg) | Hard-coded `#111` fill; suitable as a browser favicon directly. Modern browsers render SVG favicons natively |
| [`preview-chosen.html`](./preview-chosen.html) | Open in a browser to see all variants at multiple sizes on light + dark |
| [`preview.html`](./preview.html) | Side-by-side comparison of the three original concepts (gate, seal, rosette). Kept for history |
| `mark-gate.svg`, `mark-rosette.svg` | The two unchosen concepts. Kept for history; do not use |
| [`png/`](./png/) | Pre-rendered PNG variants at 16/32/48/180/192/512/1024 px plus `apple-touch-icon.png` (alias of 180). Committed so consumers don't need librsvg. Regenerate via the one-liner below if the mark changes. |

## Usage rules

1. **Clearspace.** Always leave space equal to half the mark's height on
   every side. The mark needs room to read as a seal.
2. **Don't recolour the tick separately.** The tick and the circle are
   one mark; if you must add colour, colour them together.
3. **Don't rotate the tick.** The angle reads as a tick because it is
   the canonical angle. Any rotation looks like a generic chevron.
4. **Don't stretch.** The viewBox is square. Render at a square aspect
   only. If you need a wider asset, use `logo.svg` (the lockup) instead.
5. **Don't add a drop shadow.** The mark is geometric; shadows make it
   look like a button.

## Colour

The mark itself is colour-neutral. If you need a brand colour for
accents, posters, or marketing, use one of these:

- **Slate** `#1a1a1a` — default on light surfaces
- **Bone**  `#e8e6df` — default on dark surfaces
- **Jade**  `#1f6f5c` — accent / "allow" decisions
- **Rust**  `#b04a2a` — accent / "deny" decisions (use sparingly)

The CLI styling uses these for its `ALLOW` and `DENY` banners.

## Regenerating the PNG set

The `png/` directory is committed, but if the mark changes, regenerate
all variants from `favicon.svg` with one of:

```sh
# librsvg (recommended; brew install librsvg)
cd governor/brand
for s in 16 32 48 180 192 512 1024; do
  rsvg-convert -w $s -h $s favicon.svg -o png/favicon-${s}.png
done
cp png/favicon-180.png png/apple-touch-icon.png

# ImageMagick alternative
for s in 16 32 48 180 192 512 1024; do
  magick -background none -resize ${s}x${s} favicon.svg png/favicon-${s}.png
done
```

The SVG sources are the canonical assets; the PNGs are derived. If
you change the mark, regenerate the PNG set *and* re-embed
`apple-touch-icon.png` into the worker (`server/worker/src/index.ts`,
`APPLE_TOUCH_ICON_PNG_B64`) with:

```sh
base64 -i brand/png/apple-touch-icon.png | tr -d '\n'
```
