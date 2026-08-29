# app/ — the PWA

Served by `llama-server --path ~/safetyeye/app`, so the page and the model API share
an origin. That single decision buys us no CORS, no mixed content, and a secure
context for `getUserMedia`.

## PWA — wired, nothing to do

`index.html` carries the manifest link and registers `sw.js` via `pwa.js`. The service
worker precaches every module and all 18 MB of vision weights, and never caches
`/v1/*`, `/completion` or `/health` — a cached model reply would be a demo that lies.

## Vendored paths — one copy, these ones

Both of us downloaded tfjs and COCO-SSD to different paths on 29 Aug. The duplicate
20 MB was removed; these are the live paths and `vision.js` already uses them:

```js
cocoSsd.load({ base: 'lite_mobilenet_v2',
               modelUrl: '../vendor/coco-ssd/model/model.json' });
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
