/* ============================================================================
   YOLO detector, wearing COCO-SSD's clothes.

   The app asks its detector exactly one question, in one place:

       await S.model.detect(video, maxBoxes, minScore)
         -> [{ class:"person", score:0.93, bbox:[x, y, w, h] }, ...]   // video px

   Everything downstream — the tracker, the zone test, the warning, the report —
   only ever sees that list. So a new detector does not need the app to change:
   it needs to answer the same question the same way. That is all this file is.

   COCO-SSD hands back finished boxes. YOLO does not: it returns 8400 raw
   guesses per frame and expects the caller to sort them out. The work here is
   that translation — decode, threshold, de-duplicate, and put the numbers back
   into the coordinate space of the original video frame.

   Loaded from local files only. Nothing here touches the network.
   ========================================================================== */
(function (global) {
  "use strict";

  // The 80 COCO classes, in the order YOLO emits them. Same list COCO-SSD uses,
  // so every rule in the app that names a class keeps working untouched.
  const COCO = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
    "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
    "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
    "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
    "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
    "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
  ];

  const SIZE = 640;          // the square the model was exported at
  const IOU = 0.45;          // two boxes overlapping more than this are one thing

  // The frame is letterboxed into the square, not stretched into it. Stretching a
  // 16:9 view into a square squashes people horizontally, and a squashed person is
  // a person the model has never seen. The grey bars cost nothing; the distortion
  // costs detections.
  function letterbox(source, vw, vh) {
    const scale = Math.min(SIZE / vw, SIZE / vh);
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    const padX = Math.floor((SIZE - w) / 2), padY = Math.floor((SIZE - h) / 2);
    return { scale, padX, padY, w, h };
  }

  // One reusable canvas. Allocating a 640x640 canvas twelve times a second is how
  // a monitor that has to run for a whole shift starts stuttering after ten minutes.
  let pad = null;
  function padCanvas() {
    if (!pad) {
      pad = document.createElement("canvas");
      pad.width = pad.height = SIZE;
    }
    return pad;
  }

  function toInput(source, box) {
    const c = padCanvas(), x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#727272";                 // the grey the training pipeline pads with
    x.fillRect(0, 0, SIZE, SIZE);
    x.drawImage(source, box.padX, box.padY, box.w, box.h);
    return tf.tidy(() =>
      tf.browser.fromPixels(c).toFloat().div(255).expandDims(0));
  }

  // Ultralytics exports come out as [1, 84, 8400] — one row per attribute — but
  // some converter versions transpose it. Read the shape rather than assume it;
  // guessing wrong puts every box in the wrong place and still looks plausible.
  function asRows(out) {
    const s = out.shape;
    if (s.length !== 3) throw new Error("unexpected YOLO output rank " + s.length);
    if (s[1] === COCO.length + 4) return out.squeeze([0]).transpose();  // [8400, 84]
    if (s[2] === COCO.length + 4) return out.squeeze([0]);              // already
    throw new Error("unexpected YOLO output shape " + JSON.stringify(s));
  }

  async function detect(model, source, maxBoxes, minScore) {
    const vw = source.videoWidth || source.width || 1;
    const vh = source.videoHeight || source.height || 1;
    const box = letterbox(source, vw, vh);

    const input = toInput(source, box);
    let raw;
    try {
      raw = model.execute(input);
    } finally {
      input.dispose();
    }
    const out = Array.isArray(raw) ? raw[0] : raw;

    // Split the 84 numbers per candidate into 4 box values and 80 class scores,
    // then keep only each candidate's best class.
    const picked = tf.tidy(() => {
      const rows = asRows(out);                       // [N, 84]
      const xywh = rows.slice([0, 0], [-1, 4]);
      const cls = rows.slice([0, 4], [-1, COCO.length]);
      const score = cls.max(1);
      const label = cls.argMax(1);

      // tf's NMS wants corners as [y1, x1, y2, x2]; YOLO gives centre + size.
      const cx = xywh.slice([0, 0], [-1, 1]);
      const cy = xywh.slice([0, 1], [-1, 1]);
      const w = xywh.slice([0, 2], [-1, 1]);
      const h = xywh.slice([0, 3], [-1, 1]);
      const half = tf.scalar(2);
      const corners = tf.concat([
        cy.sub(h.div(half)), cx.sub(w.div(half)),
        cy.add(h.div(half)), cx.add(w.div(half)),
      ], 1);
      return { corners, score, label };
    });

    let keep;
    try {
      keep = await tf.image.nonMaxSuppressionAsync(
        picked.corners, picked.score, maxBoxes, IOU, minScore);
    } catch (e) {
      tf.dispose([picked.corners, picked.score, picked.label, raw]);
      throw e;
    }

    const [idx, corners, scores, labels] = await Promise.all([
      keep.array(), picked.corners.array(), picked.score.array(), picked.label.array(),
    ]);
    tf.dispose([keep, picked.corners, picked.score, picked.label]);
    if (Array.isArray(raw)) tf.dispose(raw); else raw.dispose();

    // Back out of the letterbox: undo the padding, then undo the scale, and the
    // numbers are in the original video's pixels — which is what the app expects.
    const out2 = [];
    for (const i of idx) {
      const [y1, x1, y2, x2] = corners[i];
      const x = (x1 - box.padX) / box.scale;
      const y = (y1 - box.padY) / box.scale;
      const w = (x2 - x1) / box.scale;
      const h = (y2 - y1) / box.scale;
      out2.push({
        class: COCO[labels[i]] || String(labels[i]),
        score: scores[i],
        bbox: [
          Math.max(0, x), Math.max(0, y),
          Math.min(w, vw - Math.max(0, x)), Math.min(h, vh - Math.max(0, y)),
        ],
      });
    }
    return out2;
  }

  async function load(modelUrl) {
    const model = await tf.loadGraphModel(modelUrl);
    // First inference compiles the shaders and takes far longer than the rest.
    // Do it here, on a blank frame, rather than on the first person to walk in.
    const warm = tf.zeros([1, SIZE, SIZE, 3]);
    try {
      const r = model.execute(warm);
      if (Array.isArray(r)) tf.dispose(r); else r.dispose();
    } finally {
      warm.dispose();
    }
    return {
      backend: "yolo",
      detect: (source, maxBoxes = 12, minScore = 0.5) =>
        detect(model, source, maxBoxes, minScore),
    };
  }

  global.SafetyEyeYolo = { load, classes: COCO, inputSize: SIZE };
})(window);
