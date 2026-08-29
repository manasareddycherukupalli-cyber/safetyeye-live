# vendor/ — everything the app loads, loaded from disk

Nothing here comes from a CDN at runtime. The venue Wi-Fi will die and the demo runs
in aeroplane mode.

| File | What | Source |
|---|---|---|
| `tfjs/tf.min.js` | TensorFlow.js | Apache-2.0, Google |
| `coco-ssd/coco-ssd.min.js` | @tensorflow-models/coco-ssd | Apache-2.0, Google |
| `coco-ssd/model/` | SSDLite MobileNet v2 weights, 18 MB | Apache-2.0, Google |

Downloaded 29 Aug 2026 12:54 IST.

Load the model from local disk, not the default URL:

```js
const model = await cocoSsd.load({
  base: 'lite_mobilenet_v2',
  modelUrl: '../vendor/coco-ssd/model/model.json'
});
```

Without `modelUrl` the library fetches from storage.googleapis.com and the demo dies
the moment the network does.
