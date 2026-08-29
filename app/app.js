const $ = (id) => document.getElementById(id);

const statusEl = $('status');
const video = $('camera');
const canvas = $('overlay');
const ctx = canvas.getContext('2d');
const synth = $('synth');
const synthCtx = synth.getContext('2d');
const alertBanner = $('alertBanner');
const drawZoneBtn = $('drawZoneBtn');
const drawExitBtn = $('drawExitBtn');
const zoneForm = $('zoneForm');
const loading = $('loading');
const loadingText = $('loadingText');
const flash = $('flash');

const ruleEngine = new SafetyEyeRules.RuleEngine();

const appState = {
  armed: false,
  source: 'camera',
  drawMode: null,
  people: 0,
  warnings: 0,
  breaches: 0,
  latency: null,
  events: [],
};

function setStatus(msg) {
  statusEl.textContent = msg;
  if (loadingText) loadingText.textContent = msg;
  console.log('[SafetyEye]', msg);
  paintStats();
}

function setClock() {
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
setClock();
setInterval(setClock, 30000);

function go(view) {
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.view === view));
  if (view === 'report') refreshReport();
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => go(tab.dataset.view));
});

function setNum(el, val) {
  if (!el || el.textContent === String(val)) return;
  el.textContent = val;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function zoneCount() {
  return (ruleEngine.zones.has('restricted') ? 1 : 0) +
    (ruleEngine.zones.has('exit') ? 1 : 0) +
    (ruleEngine.rules.length ? 1 : 0);
}

function paintStats() {
  setNum($('h-warn'), appState.warnings);
  setNum($('h-inc'), appState.breaches);
  setNum($('h-people'), appState.armed ? appState.people : '-');
  setNum($('s-people'), appState.people);
  setNum($('s-inc'), appState.breaches);
  $('s-ms').textContent = appState.latency == null ? '-' : `${appState.latency}ms`;
  $('h-mode').textContent = appState.armed ? 'ON' : 'OFF';
  $('t-mode').className = `tile${appState.armed ? ' live' : ''}`;
  $('t-people').className = `tile${appState.people > 1 ? ' hot' : ''}`;
  $('t-inc').className = `tile${appState.breaches ? ' hot' : ''}`;
  $('armedChip').textContent = `${zoneCount()} of 3 on`;
  $('armedChip').className = `chip ${zoneCount() > 1 ? 'mint' : 'grey'}`;
  $('r-danger').textContent = ruleEngine.zones.has('restricted') ? 'On' : 'Set up';
  $('r-danger').className = `chip ${ruleEngine.zones.has('restricted') ? 'red' : 'grey'}`;
  $('r-exit').textContent = ruleEngine.zones.has('exit') ? 'On' : 'Set up';
  $('r-exit').className = `chip ${ruleEngine.zones.has('exit') ? 'blue' : 'grey'}`;
  const occupancy = ruleEngine.rules.find((r) => r.type === 'occupancy');
  $('r-limit').textContent = `Max ${occupancy?.limit || $('zoneLimit').value || 1}`;
  const hudState = $('hudState');
  hudState.className = `hud-pill ${appState.armed ? 'armed' : 'idle'}`;
  hudState.innerHTML = appState.armed
    ? '<span class="dot pulse"></span> Watching'
    : '<span class="dot pulse"></span> Not started';
  $('hudSrc').textContent = appState.source === 'camera' ? 'Camera' : 'Demo scene';
  $('homeEyebrow').innerHTML = appState.armed
    ? '<span class="dot pulse"></span> Watching now'
    : '<span class="dot"></span> Ready';
  $('armBtn').className = `btn${appState.armed ? ' danger' : ''}`;
  $('armBtn').textContent = appState.armed ? 'Stop watching' : 'Start watching';
  const badge = $('tabBadge');
  if (appState.events.length) {
    badge.style.display = 'grid';
    badge.textContent = appState.events.length;
  } else {
    badge.style.display = 'none';
  }
}

$('armBtn').addEventListener('click', () => {
  appState.armed = !appState.armed;
  setStatus(appState.armed ? 'watching for rule breaches' : 'watching paused');
  if (appState.armed) speakWarning('Now watching.');
});

const ALERT_COOLDOWN_MS = 2000;
const lastAlertAt = new Map();

function showAlert(event) {
  const key = `${event.rule.zone}:${event.rule.type}:${event.status}`;
  const now = performance.now();
  if (now - (lastAlertAt.get(key) || 0) < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(key, now);

  const div = document.createElement('div');
  div.className = event.status === 'breach' ? 'alert-breach' : 'alert-warn';
  div.textContent = `${event.status.toUpperCase()} | ${event.rule.zone}: ${event.say}`;
  alertBanner.prepend(div);
  setTimeout(() => div.remove(), 4300);

  flash.className = `alarm-flash on${event.status === 'warn' ? ' warn' : ''}`;
  setTimeout(() => { flash.className = 'alarm-flash'; }, 650);

  speakWarning(event.say);
  return true;
}

function renderLog() {
  const logList = $('logList');
  if (!appState.events.length) {
    logList.innerHTML = '<div class="empty"><b>Nothing has happened yet</b><small>Anything the camera catches will show up here straight away.</small></div>';
    return;
  }
  logList.innerHTML = appState.events.map((event) => {
    const isBreach = event.status === 'breach';
    const color = isBreach ? 'var(--red)' : 'var(--amber)';
    const title = isBreach ? 'Breach' : 'Warning';
    const time = new Date(event.ts || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    return `<div class="inc">
      <div class="bar" style="background:${color}"></div>
      <div class="body">
        <div class="t" style="color:${color}">${title} | ${event.rule?.zone || 'unknown'}</div>
        <div class="d">${event.say || event.rule?.say || 'Safety rule triggered'}</div>
        <div class="m">${time}</div>
      </div>
    </div>`;
  }).join('');
}

function addEventToUi(event) {
  appState.events.unshift({ ...event, ts: Date.now() });
  if (event.status === 'warn') appState.warnings += 1;
  if (event.status === 'breach') appState.breaches += 1;
  renderLog();
  paintStats();
}

let dragStart = null;
let pendingRect = null;

function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return [(evt.clientX - rect.left) * scaleX, (evt.clientY - rect.top) * scaleY];
}

function setDrawMode(kind) {
  appState.drawMode = appState.drawMode === kind ? null : kind;
  drawZoneBtn.classList.toggle('on', appState.drawMode === 'restricted');
  drawExitBtn.classList.toggle('on', appState.drawMode === 'exit');
  $('drawHint').style.display = appState.drawMode ? 'flex' : 'none';
  $('drawHint').textContent = appState.drawMode === 'exit'
    ? 'Drag a box around the exit or path that must stay clear.'
    : 'Drag a box around the danger zone people must stay out of.';
}

drawZoneBtn.addEventListener('click', () => setDrawMode('restricted'));
drawExitBtn.addEventListener('click', () => setDrawMode('exit'));

canvas.addEventListener('pointerdown', (evt) => {
  if (!appState.drawMode) return;
  dragStart = canvasPoint(evt);
  canvas.setPointerCapture(evt.pointerId);
});

canvas.addEventListener('pointerup', (evt) => {
  if (!appState.drawMode || !dragStart) return;
  const [ex, ey] = canvasPoint(evt);
  const [sx, sy] = dragStart;
  const rect = {
    x: Math.min(sx, ex),
    y: Math.min(sy, ey),
    w: Math.abs(ex - sx),
    h: Math.abs(ey - sy),
  };
  dragStart = null;
  if (rect.w < 10 || rect.h < 10) return;

  pendingRect = rect;
  const zoneName = appState.drawMode === 'exit' ? 'exit' : 'restricted';
  const type = appState.drawMode === 'exit' ? 'obstruction' : 'zone_intrusion';
  const say = appState.drawMode === 'exit' ? 'Keep the exit clear.' : 'Step back from the danger zone.';

  ruleEngine.setZone(zoneName, pendingRect);
  const existingIdx = ruleEngine.rules.findIndex((r) => r.zone === zoneName);
  const rule = { type, zone: zoneName, limit: 1, severity: 'critical', say };
  if (existingIdx >= 0) ruleEngine.rules[existingIdx] = rule;
  else ruleEngine.addRule(rule);

  pendingRect = null;
  setDrawMode(appState.drawMode);
  setStatus(`${zoneName} zone set`);
});

$('zoneSaveBtn').addEventListener('click', () => {
  const name = $('zoneName').value.trim() || `zone${ruleEngine.zones.size + 1}`;
  const type = $('zoneType').value;
  const limit = Number($('zoneLimit').value) || 1;
  const severity = $('zoneSeverity').value;
  const say = $('zoneSay').value.trim() || `Warning: ${name}`;

  ruleEngine.setZone(name, pendingRect);
  ruleEngine.addRule({ type, zone: name, limit, severity, say });
  zoneForm.style.display = 'none';
  pendingRect = null;
  setStatus('running');
});

$('zoneCancelBtn').addEventListener('click', () => {
  zoneForm.style.display = 'none';
  pendingRect = null;
  setStatus('running');
});

const ruleInput = $('ruleInput');
const ruleJsonPreview = $('ruleJsonPreview');

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
  setStatus('compiling rule...');
  try {
    const { rules } = await LLM.compileRules(text.trim(), [...ruleEngine.zones.keys()]);
    for (const rule of rules) {
      ensureZoneExists(rule.zone);
      ruleEngine.addRule(rule);
    }
    ruleJsonPreview.textContent = JSON.stringify({ rules }, null, 2);
    ruleJsonPreview.style.display = 'block';
    ruleInput.value = '';
    setStatus('rule added');
  } catch (err) {
    setStatus('running');
    showAlert({ status: 'breach', rule: { zone: 'rule compiler' }, say: `could not compile rule: ${err.message}` });
  }
}

$('submitRuleBtn').addEventListener('click', () => submitRuleText(ruleInput.value));
ruleInput.addEventListener('keydown', (evt) => {
  if (evt.key === 'Enter') submitRuleText(ruleInput.value);
});

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const speakRuleBtn = $('speakRuleBtn');
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
  speakRuleBtn.title = 'Speech recognition is not supported in this browser. Type the rule instead.';
}

function speakWarning(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

$('testLlmBtn').addEventListener('click', async () => {
  setStatus('asking the AI brain...');
  try {
    const { text } = await LLM.chat([{ role: 'user', content: 'Reply with exactly one word: ready' }]);
    setStatus('running');
    showAlert({ status: 'warn', rule: { zone: 'AI brain' }, say: `replied: "${text.trim()}"` });
  } catch (err) {
    setStatus('running');
    showAlert({ status: 'breach', rule: { zone: 'AI brain' }, say: `not reachable: ${err.message}` });
  }
});

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = video.videoWidth || Math.round(rect.width);
  const height = video.videoHeight || Math.round(rect.height);
  canvas.width = width;
  canvas.height = height;
  synth.width = width;
  synth.height = height;
}

async function startCamera() {
  setStatus('requesting camera...');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => { video.onloadedmetadata = resolve; });
  fitCanvas();
}

function drawZones() {
  ctx.lineWidth = 2;
  ctx.font = '700 14px Inter, sans-serif';
  for (const [name, rect] of ruleEngine.zones) {
    const isExit = name === 'exit';
    const color = isExit ? '#4da3ff' : '#ff5a5a';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
    ctx.fillStyle = `${color}26`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, Math.max(0, rect.y - 18), Math.min(150, rect.w), 18);
    ctx.fillStyle = '#04070a';
    ctx.fillText(isExit ? 'FIRE EXIT' : name.toUpperCase(), rect.x + 6, Math.max(14, rect.y - 5));
    ctx.restore();
  }
}

function drawTracks(tracks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawZones();
  ctx.lineWidth = 2;
  ctx.font = '600 14px Inter, sans-serif';
  for (const t of tracks) {
    const [x, y, w, h] = t.bbox;
    const inZone = [...ruleEngine.zones.values()].some((rect) => SafetyEyeRules.pointInRect(t.center, rect));
    const color = inZone ? '#ff5a5a' : '#00e5a0';
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillText(`#${t.id} ${t.class} ${(t.score * 100).toFixed(0)}%`, x + 4, y > 16 ? y - 4 : y + 16);

    const [cx, cy] = t.center;
    const [px, py] = t.predictedCenter;
    ctx.strokeStyle = '#ffb84d';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = '#ffb84d';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDemoBackdrop() {
  const w = synth.width || 640;
  const h = synth.height || 853;
  synthCtx.clearRect(0, 0, w, h);
  const grad = synthCtx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#17212c');
  grad.addColorStop(1, '#05070a');
  synthCtx.fillStyle = grad;
  synthCtx.fillRect(0, 0, w, h);
  synthCtx.strokeStyle = 'rgba(255,255,255,.08)';
  synthCtx.lineWidth = 1;
  for (let y = h * .18; y < h; y += 42) {
    synthCtx.beginPath();
    synthCtx.moveTo(0, y);
    synthCtx.lineTo(w, y + 18);
    synthCtx.stroke();
  }
  synthCtx.fillStyle = 'rgba(255,184,77,.12)';
  synthCtx.fillRect(w * .08, h * .66, w * .84, h * .12);
  synthCtx.fillStyle = '#5f6e7e';
  synthCtx.font = '700 13px Inter, sans-serif';
  synthCtx.fillText('No live camera available', w * .18, h * .48);
}

async function detectLoop(model, tracker) {
  const start = performance.now();
  const detections = await model.detect(video);
  const tracks = tracker.update(detections, performance.now());
  appState.latency = Math.round(performance.now() - start);
  appState.people = tracks.filter((t) => t.class === 'person').length;
  drawTracks(tracks);

  if (appState.armed) {
    const events = ruleEngine.evaluate(tracks);
    for (const event of events) {
      const fired = showAlert(event);
      if (fired) {
        addEventToUi(event);
        logSafetyEvent(event);
      }
    }
  }

  paintStats();
  requestAnimationFrame(() => detectLoop(model, tracker));
}

async function logSafetyEvent(event) {
  const record = { status: event.status, rule: event.rule };
  if (event.status === 'breach' && appState.source === 'camera') {
    record.snapshot = SafetyEyeReport.captureBlurredFrame(video);
  }
  try {
    await SafetyEyeLog.logEvent(record);
  } catch (err) {
    console.error('[SafetyEye] failed to log event', err);
  }
}

async function refreshReport() {
  const events = await SafetyEyeLog.getSessionEvents();
  const summary = SafetyEyeReport.summarize(events);
  $('reportContent').innerHTML = SafetyEyeReport.renderReportHtml(summary);
  $('p-warn').textContent = summary.totalWarnings;
  $('p-brch').textContent = summary.totalBreaches;
  $('p-pct').textContent = `${summary.preventedPct}%`;
}

$('reportBtn').addEventListener('click', refreshReport);

async function main() {
  try {
    fitCanvas();
    await startCamera();
    setStatus('loading vision model...');
    const model = await SafetyEyeVision.loadVisionModel();
    const tracker = new SafetyEyeVision.Tracker();
    loading.classList.add('hide');
    setStatus('ready');
    detectLoop(model, tracker);
  } catch (err) {
    appState.source = 'demo';
    fitCanvas();
    drawDemoBackdrop();
    loading.classList.add('hide');
    setStatus(`camera unavailable: ${err.message}`);
    console.error(err);
  }
  paintStats();
  refreshReport();
}

window.addEventListener('resize', () => {
  fitCanvas();
  if (appState.source === 'demo') drawDemoBackdrop();
  drawZones();
});

paintStats();
renderLog();
main();
