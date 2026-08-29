// Object detection + IoU tracking + short-horizon trajectory prediction.
// Exposes window.SafetyEyeVision = { loadVisionModel, Tracker, PREDICTION_HORIZON_SEC }

const PREDICTION_HORIZON_SEC = 0.75;
const MAX_MISSED_FRAMES = 5;
const IOU_MATCH_THRESHOLD = 0.3;
const VELOCITY_SMOOTHING = 0.5; // 0 = ignore new sample, 1 = no smoothing

async function loadVisionModel() {
  return cocoSsd.load({
    base: 'lite_mobilenet_v2',
    modelUrl: './vendor/coco-ssd/model.json',
  });
}

function bboxCenter([x, y, w, h]) {
  return [x + w / 2, y + h / 2];
}

function iou(a, b) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ix1 = Math.max(ax, bx);
  const iy1 = Math.max(ay, by);
  const ix2 = Math.min(ax + aw, bx + bw);
  const iy2 = Math.min(ay + ah, by + bh);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const union = aw * ah + bw * bh - intersection;
  return union <= 0 ? 0 : intersection / union;
}

// Assigns a stable id to each detection across frames (via IoU overlap with
// the previous frame) and estimates velocity so a position ~0.75s ahead can
// be projected — the app warns based on that projection, not the current spot.
class Tracker {
  constructor() {
    this.tracks = [];
    this.nextId = 1;
  }

  update(detections, now) {
    const unmatchedDetections = new Set(detections.map((_, i) => i));
    const unmatchedTracks = new Set(this.tracks.map((_, i) => i));

    const candidatePairs = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      for (let di = 0; di < detections.length; di++) {
        const score = iou(this.tracks[ti].bbox, detections[di].bbox);
        if (score >= IOU_MATCH_THRESHOLD) candidatePairs.push({ ti, di, score });
      }
    }
    candidatePairs.sort((a, b) => b.score - a.score);

    for (const { ti, di } of candidatePairs) {
      if (!unmatchedTracks.has(ti) || !unmatchedDetections.has(di)) continue;
      const track = this.tracks[ti];
      const det = detections[di];
      const dt = Math.max((now - track.lastSeen) / 1000, 1 / 30);
      const newCenter = bboxCenter(det.bbox);
      const vx = (newCenter[0] - track.center[0]) / dt;
      const vy = (newCenter[1] - track.center[1]) / dt;

      track.velocity = [
        track.velocity[0] * (1 - VELOCITY_SMOOTHING) + vx * VELOCITY_SMOOTHING,
        track.velocity[1] * (1 - VELOCITY_SMOOTHING) + vy * VELOCITY_SMOOTHING,
      ];
      track.bbox = det.bbox;
      track.center = newCenter;
      track.class = det.class;
      track.score = det.score;
      track.lastSeen = now;
      track.missed = 0;

      unmatchedTracks.delete(ti);
      unmatchedDetections.delete(di);
    }

    for (const di of unmatchedDetections) {
      const det = detections[di];
      this.tracks.push({
        id: this.nextId++,
        bbox: det.bbox,
        center: bboxCenter(det.bbox),
        velocity: [0, 0],
        class: det.class,
        score: det.score,
        lastSeen: now,
        missed: 0,
      });
    }

    for (const ti of unmatchedTracks) {
      this.tracks[ti].missed += 1;
    }
    this.tracks = this.tracks.filter((t) => t.missed <= MAX_MISSED_FRAMES);

    return this.tracks.map((t) => ({
      id: t.id,
      class: t.class,
      score: t.score,
      bbox: t.bbox,
      center: t.center,
      velocity: t.velocity,
      predictedCenter: [
        t.center[0] + t.velocity[0] * PREDICTION_HORIZON_SEC,
        t.center[1] + t.velocity[1] * PREDICTION_HORIZON_SEC,
      ],
    }));
  }
}

window.SafetyEyeVision = { loadVisionModel, Tracker, PREDICTION_HORIZON_SEC };
