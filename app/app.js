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

function drawTracks(tracks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.font = '16px sans-serif';
  for (const t of tracks) {
    const [x, y, w, h] = t.bbox;

    ctx.strokeStyle = '#00ff88';
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`#${t.id} ${t.class} ${(t.score * 100).toFixed(0)}%`, x + 4, y > 16 ? y - 4 : y + 16);

    // predicted position ~0.75s ahead, drawn as a dot + connecting line
    const [cx, cy] = t.center;
    const [px, py] = t.predictedCenter;
    ctx.strokeStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function detectLoop(model, tracker) {
  const detections = await model.detect(video);
  const tracks = tracker.update(detections, performance.now());
  drawTracks(tracks);
  requestAnimationFrame(() => detectLoop(model, tracker));
}

async function main() {
  try {
    await startCamera();
    setStatus('loading vision model (local, no CDN)…');
    const model = await SafetyEyeVision.loadVisionModel();
    const tracker = new SafetyEyeVision.Tracker();
    setStatus('running');
    detectLoop(model, tracker);
  } catch (err) {
    setStatus('error: ' + err.message);
    console.error(err);
  }
}

main();
