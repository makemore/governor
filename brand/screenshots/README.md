# README screenshots

The PNGs in this directory (`public-light.png`, `public-dark.png`) are
the hero screenshots embedded at the top of the main [`README`](../../README.md).

They are a faithful snapshot of the public status page rendered by
[`server/worker/src/public-render.ts`](../../server/worker/src/public-render.ts)
— same CSS, same markup, with representative sample data.

## Regenerating

```sh
# 1. render the HTML (writes light.html + dark.html, gitignored)
node brand/screenshots/render.mjs

# 2. screenshot each variant with headless Chrome
for v in light dark; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new --disable-gpu --hide-scrollbars \
    --window-size=900,1320 --force-device-scale-factor=2 \
    --screenshot=brand/screenshots/public-${v}.png \
    file://$(pwd)/brand/screenshots/${v}.html
done
```

On Linux replace the Chrome path with `chromium` or `google-chrome`.

## Keep in sync

If you change the public page's CSS or markup, copy the changes into
`render.mjs` and regenerate. The live page is canonical; this is a
documentation artifact.
