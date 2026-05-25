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
| [`logo.svg`](./logo.svg) | Mark + "Governor" wordmark lockup. Wordmark uses system fonts; outline the text before any external distribution |
| [`favicon.svg`](./favicon.svg) | Hard-coded `#111` fill; suitable as a browser favicon directly. Modern browsers render SVG favicons natively |
| [`preview-chosen.html`](./preview-chosen.html) | Open in a browser to see all variants at multiple sizes on light + dark |
| [`preview.html`](./preview.html) | Side-by-side comparison of the three original concepts (gate, seal, rosette). Kept for history |
| `mark-gate.svg`, `mark-rosette.svg` | The two unchosen concepts. Kept for history; do not use |

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

## Generating PNG variants

If you want PNG copies for legacy environments (older email clients,
some social cards, app-store listings), the SVGs convert with one
of the following:

```sh
# librsvg (recommended; brew install librsvg)
for s in 16 32 48 180 512 1024; do
  rsvg-convert -w $s -h $s favicon.svg -o favicon-${s}.png
done

# ImageMagick alternative
for s in 16 32 48 180 512 1024; do
  magick -background none -resize ${s}x${s} favicon.svg favicon-${s}.png
done
```

Neither tool is shipped with this repo; the SVG sources are the
canonical assets. PNGs go in `./png/` if generated (gitignored).
