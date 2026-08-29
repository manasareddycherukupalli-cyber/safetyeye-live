# app/ — the PWA

Served by `llama-server --path ~/safetyeye/app`, so the page and the model API share
an origin. That single decision buys us no CORS, no mixed content, and a secure
context for `getUserMedia`.

## For Surendra — two lines to add to `index.html`

The PWA plumbing is written and working; `index.html` just needs to opt in.

In `<head>`:

```html
<link rel="manifest" href="./manifest.webmanifest">
<meta name="theme-color" content="#0d1117">
<link rel="apple-touch-icon" href="./icon-192.png">
```

Before your other scripts:

```html
<script src="./pwa.js"></script>
```

That's it. `sw.js` already lists `./index.html` in its precache list.

## Loading COCO-SSD — do not skip the modelUrl

```js
const model = await cocoSsd.load({
  base: 'lite_mobilenet_v2',
  modelUrl: '../vendor/coco-ssd/model.json'
});
```

Without `modelUrl` the library silently fetches from storage.googleapis.com and the
demo dies the instant we go into aeroplane mode.

## Files

| File | Owner | What |
|---|---|---|
| `index.html` | Surendra | app shell |
| `app.js` | Surendra | orchestration, demo-mode toggle |
| `vision.js` | Surendra | COCO-SSD, IoU tracker, 0.75s projection |
| `rules.js` | Surendra | zone geometry, occupancy, obstruction, proximity |
| `report.js` | Surendra | shift report, on-device blur |
| `llm.js` | Manasa | compileRules, writeReport, askLog |
| `log.js` | Manasa | IndexedDB events + frames |
| `mesh.js` | Manasa | relay client |
| `llm-test.html` | Manasa | standalone model bench, delete before submission |
| `sw.js`, `pwa.js`, `manifest.webmanifest` | shared | PWA plumbing |

## Service worker gotcha

`sw.js` caches static files aggressively. While developing, if a change doesn't show
up: Chrome → ⋮ → Settings → Site settings → Storage → clear, or open DevTools over
USB and tick "Update on reload". It never caches `/v1/*`, `/completion` or `/health`
— a cached model reply would be a demo that lies.
