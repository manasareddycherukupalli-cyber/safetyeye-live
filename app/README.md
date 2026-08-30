# app/ — the PWA

Served as static files from `~/safetyeye/app` on `127.0.0.1`, which keeps the page on
a secure context and so buys us `getUserMedia` with no tunnel and no certificate.

## PWA — wired, nothing to do

`index.html` carries the manifest link and registers `sw.js` via `pwa.js`. The service
worker precaches every module and all 18 MB of vision weights, so the app opens with
no network at all.

## Vendored paths — one copy, inside `app/`

Both of us downloaded tfjs and COCO-SSD to different paths on 29 Aug. The duplicate
20 MB was removed, and on 29 Aug 13:45 the surviving copy moved from `vendor/` at the
repo root to `app/vendor/`. It had to: the server's document root is `app/`, so
`../vendor/...` pointed above it and would have 404'd the first time this ran for
real. These are the live paths:

```js
const model = await cocoSsd.load({
  base: 'lite_mobilenet_v2',
  modelUrl: './vendor/coco-ssd/model.json'
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
| `log.js` | Manasa | IndexedDB events + frames |
| `mesh.js` | Manasa | relay client — publishes events, polls for them |
| `supervisor.html`, `supervisor.js` | Manasa | the second phone's console |
| `vendor/` | shared | tfjs + COCO-SSD weights, loaded from disk, never a CDN |
| `sw.js`, `pwa.js`, `manifest.webmanifest` | shared | PWA plumbing |

## Service worker gotcha

`sw.js` caches static files aggressively. While developing, if a change doesn't show
up: Chrome → ⋮ → Settings → Site settings → Storage → clear, or open DevTools over
USB and tick "Update on reload".

## The mesh — two phones, events only

The site phone needs no setup: `mesh.js` wraps `SafetyEyeLog.logEvent`, so anything
worth logging is also published, and with no relay address configured `publish()` is a
no-op. Detection never waits on the network.

The supervisor phone opens `supervisor.html`, types the relay's LAN address (`ip:port`
is enough — it fills in the scheme) and taps Connect. It replays the shift from seq 0,
then polls at 1 Hz.

Start the relay on whichever device is reachable:

```
python3 server/relay.py --host 0.0.0.0 --port 8090
```

What crosses the wire is events, never video and never frames. `getUserMedia` is
refused on any non-localhost origin, so the camera physically cannot move off the
device that renders it — and blurred breach stills are stripped by `mesh.js` before
sending and dropped again by the relay, so they stay on the phone that took them.
