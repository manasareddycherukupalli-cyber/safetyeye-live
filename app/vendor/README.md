# app/vendor/ — everything the app loads, loaded from disk

Nothing here comes from a CDN at runtime. The venue Wi-Fi will die and the demo runs
in aeroplane mode.

| File | What | Source |
|---|---|---|
| `tf.min.js` | TensorFlow.js 4.22.0 | Apache-2.0, Google |
| `coco-ssd.min.js` | @tensorflow-models/coco-ssd 2.2.3 | Apache-2.0, Google |
| `coco-ssd/` | SSDLite MobileNet v2 weights, 18 MB | Apache-2.0, Google |

Downloaded 29 Aug 2026 12:54 IST. Moved under `app/` on 29 Aug 13:45 IST: the server's
document root is `app/`, so a sibling `vendor/` at the repo root was unreachable at
runtime — `../vendor/...` resolves above the document root and 404s.

Load the model from local disk, not the default URL:

```js
const model = await cocoSsd.load({
  base: 'lite_mobilenet_v2',
  modelUrl: './vendor/coco-ssd/model.json'
});
```

Without `modelUrl` the library fetches from storage.googleapis.com and the demo dies
the moment the network does.
