const statusEl = document.getElementById('status');
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

function setStatus(msg) {
  statusEl.textContent = msg;
  console.log('[SafetyEye]', msg);
}

async function startCamera() {
  setStatus('requesting camera…');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

async function loadModel() {
  setStatus('loading vision model (local, no CDN)…');
  return cocoSsd.load({
    base: 'lite_mobilenet_v2',
    modelUrl: '../vendor/coco-ssd/model/model.json',
  });
}

function drawDetections(detections) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.font = '16px sans-serif';
  for (const d of detections) {
    const [x, y, w, h] = d.bbox;
    ctx.strokeStyle = '#00ff88';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`${d.class} ${(d.score * 100).toFixed(0)}%`, x + 4, y > 16 ? y - 4 : y + 16);
  }
}

async function detectLoop(model) {
  const detections = await model.detect(video);
  drawDetections(detections);
  requestAnimationFrame(() => detectLoop(model));
}

async function main() {
  try {
    await startCamera();
    const model = await loadModel();
    setStatus('running');
    detectLoop(model);
  } catch (err) {
    setStatus('error: ' + err.message);
    console.error(err);
  }
}

main();
