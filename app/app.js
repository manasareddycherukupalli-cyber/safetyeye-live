const statusEl = document.getElementById('status');
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const alertBanner = document.getElementById('alertBanner');
const drawZoneBtn = document.getElementById('drawZoneBtn');
const zoneForm = document.getElementById('zoneForm');

const ruleEngine = new SafetyEyeRules.RuleEngine();

function setStatus(msg) {
  statusEl.textContent = msg;
  console.log('[SafetyEye]', msg);
}

const ALERT_COOLDOWN_MS = 2000;
const lastAlertAt = new Map(); // key -> timestamp, so a standing violation doesn't spam every frame

function showAlert(event) {
  const key = `${event.rule.zone}:${event.rule.type}:${event.status}`;
  const now = performance.now();
  if (now - (lastAlertAt.get(key) || 0) < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(key, now);

  const div = document.createElement('div');
  div.className = event.status === 'breach' ? 'alert-breach' : 'alert-warn';
  div.textContent = `[${event.status.toUpperCase()}] ${event.rule.zone}: ${event.say}`;
  alertBanner.prepend(div);
  setTimeout(() => div.remove(), 4000);

  speakWarning(event.say);
}

// --- Zone drawing: click-drag on the canvas to define a rectangle, then a
// small form names it and attaches a rule. This lets rules be tested now,
// ahead of the voice-driven rule creation (a later task) landing on top of it.
let drawingZone = false;
let dragStart = null;
let pendingRect = null;

function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return [(evt.clientX - rect.left) * scaleX, (evt.clientY - rect.top) * scaleY];
}

drawZoneBtn.addEventListener('click', () => {
  drawingZone = true;
  setStatus('draw mode: click and drag on the video to mark a zone');
});

canvas.addEventListener('mousedown', (evt) => {
  if (!drawingZone) return;
  dragStart = canvasPoint(evt);
});

canvas.addEventListener('mouseup', (evt) => {
  if (!drawingZone || !dragStart) return;
  const [ex, ey] = canvasPoint(evt);
  const [sx, sy] = dragStart;
  const rect = {
    x: Math.min(sx, ex),
    y: Math.min(sy, ey),
    w: Math.abs(ex - sx),
    h: Math.abs(ey - sy),
  };
  dragStart = null;
  drawingZone = false;
  if (rect.w < 10 || rect.h < 10) return; // ignore accidental clicks

  pendingRect = rect;
  zoneForm.style.display = 'block';
  zoneForm.style.left = Math.min(evt.clientX, window.innerWidth - 200) + 'px';
  zoneForm.style.top = Math.min(evt.clientY, window.innerHeight - 220) + 'px';
});

document.getElementById('zoneSaveBtn').addEventListener('click', () => {
  const name = document.getElementById('zoneName').value.trim() || `zone${ruleEngine.zones.size + 1}`;
  const type = document.getElementById('zoneType').value;
  const limit = Number(document.getElementById('zoneLimit').value) || 1;
  const severity = document.getElementById('zoneSeverity').value;
  const say = document.getElementById('zoneSay').value.trim() || `Warning: ${name}`;

  ruleEngine.setZone(name, pendingRect);
  ruleEngine.addRule({ type, zone: name, limit, severity, say });

  zoneForm.style.display = 'none';
  pendingRect = null;
  setStatus('running');
});

document.getElementById('zoneCancelBtn').addEventListener('click', () => {
  zoneForm.style.display = 'none';
  pendingRect = null;
  setStatus('running');
});

// --- Task 7: speech/typed rule -> compiled JSON rule -> zone appears -> spoken warning.
const ruleInput = document.getElementById('ruleInput');
const ruleJsonPreview = document.getElementById('ruleJsonPreview');

// If the LLM names a zone that hasn't been drawn yet, place a reasonable
// default rectangle so the zone appears immediately (matches the demo: "say
// a rule, the zone draws itself") — it can still be redrawn by hand later.
function ensureZoneExists(name) {
  if (ruleEngine.zones.has(name)) return;
  const w = canvas.width * 0.3 || 200;
  const h = canvas.height * 0.3 || 150;
  ruleEngine.setZone(name, {
    x: (canvas.width || 640) / 2 - w / 2,
    y: (canvas.height || 480) / 2 - h / 2,
    w,
    h,
  });
}

async function submitRuleText(text) {
  if (!text || !text.trim()) return;
  setStatus('compiling rule…');
  try {
    const rules = await SafetyEyeLLM.compileRules(text.trim());
    for (const rule of rules) {
      ensureZoneExists(rule.zone);
      ruleEngine.addRule(rule);
    }
    ruleJsonPreview.textContent = JSON.stringify({ rules }, null, 2);
    ruleJsonPreview.style.display = 'block';
    ruleInput.value = '';
    setStatus('running');
  } catch (err) {
    setStatus('running');
    showAlert({ status: 'breach', rule: { zone: 'rule compiler' }, say: `couldn't compile rule — ${err.message}` });
  }
}

document.getElementById('submitRuleBtn').addEventListener('click', () => {
  submitRuleText(ruleInput.value);
});
ruleInput.addEventListener('keydown', (evt) => {
  if (evt.key === 'Enter') submitRuleText(ruleInput.value);
});

// Speech input is a convenience layer over the same typed path — and per
// CLAUDE.md's disclosed limitation, the browser's speech recognition sends
// audio to Google, so it punctures the "fully offline" claim. Typed input
// is the offline-safe fallback; both feed the same submitRuleText().
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const speakRuleBtn = document.getElementById('speakRuleBtn');
if (SpeechRecognitionImpl) {
  const recognition = new SpeechRecognitionImpl();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (evt) => {
    const transcript = evt.results[0][0].transcript;
    ruleInput.value = transcript;
    submitRuleText(transcript);
  });
  recognition.addEventListener('error', (evt) => {
    showAlert({ status: 'warn', rule: { zone: 'speech input' }, say: `mic error: ${evt.error}` });
  });

  speakRuleBtn.addEventListener('click', () => recognition.start());
} else {
  speakRuleBtn.disabled = true;
  speakRuleBtn.title = 'Speech recognition not supported in this browser — type the rule instead';
}

// Spoken warnings: say the rule's "say" line out loud when it fires, using
// the browser's built-in speech synthesis (on-device, no network call).
function speakWarning(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utterance);
}

// --- Task 6: one round trip to the on-device model server, to confirm the
// app <-> llama-server connection works before anything is built on top of it.
document.getElementById('testLlmBtn').addEventListener('click', async () => {
  setStatus('asking the AI brain…');
  try {
    const reply = await SafetyEyeLLM.chatCompletion([
      { role: 'user', content: 'Reply with exactly one word: ready' },
    ]);
    setStatus('running');
    showAlert({ status: 'warn', rule: { zone: 'AI brain' }, say: `replied: "${reply.trim()}"` });
  } catch (err) {
    setStatus('running');
    showAlert({ status: 'breach', rule: { zone: 'AI brain' }, say: `not reachable — ${err.message}` });
  }
});

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

function drawZones() {
  ctx.lineWidth = 2;
  ctx.font = '14px sans-serif';
  for (const [name, rect] of ruleEngine.zones) {
    ctx.strokeStyle = '#ff4444';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(255, 68, 68, 0.15)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#ff4444';
    ctx.fillText(name, rect.x + 4, rect.y + 16);
  }
}

function drawTracks(tracks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawZones();
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

  const events = ruleEngine.evaluate(tracks);
  for (const event of events) showAlert(event);

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
