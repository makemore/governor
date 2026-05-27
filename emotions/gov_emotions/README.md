# gov emotion suite

A 26-state suite built around a single minimal motif: a 160×160 dark rounded square with a face composed of brows, eyes and a mouth in `#fafafa` on `#1a1a1a`. Designed to be used as status marks and animated by swapping between states.

## Files

- `svgs/gov_*.svg` — 26 standalone SVGs, each `viewBox="0 0 160 160"`, all the same canvas.
- `preview.html` — open this in a browser to see the whole suite and a play-through.
- `contact_sheet.svg` — a single labelled contact sheet of all 26.

## The states

| #  | name           | use                                        |
|----|----------------|--------------------------------------------|
| 01 | default        | resting state                              |
| 02 | furious        | hard error / failure                       |
| 03 | disapproving   | warning / declined                         |
| 04 | unimpressed    | neutral-negative / "really?"               |
| 05 | sceptical      | needs verification                         |
| 06 | smug           | success-but-told-you-so                    |
| 07 | surprised      | unexpected event                           |
| 08 | shocked        | high-severity alert                        |
| 09 | confused       | ambiguous input                            |
| 10 | questioning    | awaiting clarification                     |
| 11 | thinking       | processing / loading                       |
| 12 | side eye       | suspicious                                 |
| 13 | worried        | degraded / pending issue                   |
| 14 | sad            | soft error                                 |
| 15 | resigned       | accepting defeat                           |
| 16 | asleep         | idle / sleeping                            |
| 17 | dead inside    | service down / fatal                       |
| 18 | pleased        | passive success                            |
| 19 | smiling        | active success                             |
| 20 | cheeky         | playful / easter egg                       |
| 21 | grinning       | menacing success                           |
| 22 | silenced       | muted / read-only                          |
| 23 | greedy         | billing / paywall                          |
| 24 | lovestruck     | favourite / liked                          |
| 25 | unibrow rage   | critical anger                             |
| 26 | speechless     | empty state                                |

## Design language (so new states stay on-brand)

- Canvas: `<rect x=0 y=0 width=160 height=160 rx=6 fill="#1a1a1a"/>`
- Foreground: `#fafafa`
- Eye centres at `y ≈ 92`, x = `55` and `105`
- Mouth lives around `y = 122–134`
- Brows: rectangles ~52×10, rotated ±18° for the default angry slash; flat = horizontal rects; raised = mirror of angry
- Only three primitives in play: rect, circle, path. No gradients, no strokes on the head.

## Animating between states

Each SVG has identical canvas and coordinates, so swapping is clean. Three approaches:

**1. Swap `innerHTML`** (simplest, what `preview.html` does):
```js
container.innerHTML = await fetch(`svgs/gov_${slug}.svg`).then(r => r.text());
```

**2. Use as `<img>` and swap `src`:**
```html
<img id="gov" src="svgs/gov_01_default.svg" width="64" height="64">
<script>
  document.getElementById("gov").src = "svgs/gov_02_furious.svg";
</script>
```

**3. Sprite the lot** — concat all 26 into one SVG with `<symbol>` tags and reference via `<use xlink:href="#gov-furious"/>`. Best for performance if you embed many at once.

For a "transition" feel, fade-swap with a 100–150ms opacity cross:
```css
.gov { transition: opacity 120ms; }
.gov.swapping { opacity: 0; }
```

## Status mark usage

The square is dense enough to read at 16–24px (favicons, inline badges) and detailed enough to anchor a 200px hero. Recommended sizes:
- inline status: 16–20px
- list-row avatar: 32–40px
- card / panel header: 64–96px
- hero: 160px+

## Recolouring

If you want a non-monochrome variant, find/replace `#1a1a1a` (head) and `#fafafa` (features). The two-tone palette is the whole language — don't add a third colour without reason.
