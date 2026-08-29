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

/* ---------- alarm: Web Audio siren + speech ----------
   Both halves need priming. Mobile browsers start the AudioContext suspended
   and drop speechSynthesis utterances until a real user gesture has happened,
   which is why nothing was audible before. Alarm.unlock() runs on the first
   touch anywhere and on every arm.                                          */
const Alarm = (() => {
  let ctx = null;
  let primed = false;
  let voice = null;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    voice = voices.find((v) => /^en[-_]IN/i.test(v.lang))
      || voices.find((v) => /^en[-_]GB/i.test(v.lang))
      || voices.find((v) => /^en/i.test(v.lang))
      || voices[0];
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  function unlock() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (err) { /* no Web Audio: speech still works */ }
    if (!primed && 'speechSynthesis' in window) {
      // An empty utterance inside the gesture opens the speech channel on Android.
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
        primed = true;
      } catch (err) { /* ignore */ }
    }
  }

  // One tone. `when` is an offset in seconds from now.
  function tone(freq, when, dur, gain = 0.28, type = 'square') {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.setValueAtTime(gain, t0 + dur - 0.03);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function beep() {
    unlock();
    tone(880, 0, 0.18);
    tone(660, 0.2, 0.18);
    return 0.4;
  }

  // Two-tone emergency siren, three sweeps. Returns its length in seconds so
  // the spoken warning can start after it instead of fighting it.
  function siren() {
    unlock();
    for (let i = 0; i < 3; i += 1) {
      tone(950, i * 0.34, 0.16, 0.34, 'sawtooth');
      tone(640, i * 0.34 + 0.17, 0.16, 0.34, 'sawtooth');
    }
    return 1.02;
  }

  function say(text, delaySec = 0) {
    if (!text || !('speechSynthesis' in window)) return;
    // cancel() immediately followed by speak() is swallowed on Android Chrome,
    // so leave a tick between them.
    speechSynthesis.cancel();
    setTimeout(() => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-IN'; }
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1;
        speechSynthesis.speak(u);
      } catch (err) { /* ignore */ }
    }, Math.max(140, delaySec * 1000));
  }

  function fire(status, text) {
    const lead = status === 'breach' ? siren() : beep();
    say(text, lead);
    if (navigator.vibrate) navigator.vibrate(status === 'breach' ? [220, 90, 220, 90, 220] : [140]);
  }

  return { unlock, beep, siren, say, fire };
})();

// Any touch or click anywhere counts as the gesture that unlocks audio.
window.addEventListener('pointerdown', () => Alarm.unlock(), { once: true });

$('armBtn').addEventListener('click', () => {
  Alarm.unlock();
  appState.armed = !appState.armed;
  setStatus(appState.armed ? 'watching for rule breaches' : 'watching paused');
  if (appState.armed) Alarm.say('Now watching.');
});

const ALERT_COOLDOWN_MS = 2000;
const lastAlertAt = new Map();

const tally = { warn: 0, breach: 0 };

function renderTally() {
  const total = tally.warn + tally.breach;
  const pct = total ? Math.round((tally.warn / total) * 100) : 0;
  const el = document.getElementById('tally');
  if (!el) return;
  el.innerHTML =
    `<b>${tally.warn}</b> warned <span class="sep">·</span> ` +
    `<b>${tally.breach}</b> breached <span class="sep">·</span> ` +
    `<b class="pct">${pct}%</b> prevented`;
}

function showAlert(event) {
  const key = `${event.rule.zone}:${event.rule.type}:${event.status}`;
  const now = performance.now();
  if (now - (lastAlertAt.get(key) || 0) < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(key, now);

  if (event.status === 'breach') tally.breach += 1; else tally.warn += 1;
  renderTally();

  const div = document.createElement('div');
  div.className = event.status === 'breach' ? 'alert-breach' : 'alert-warn';
  div.textContent = `${event.status.toUpperCase()} | ${event.rule.zone}: ${event.say}`;
  alertBanner.prepend(div);
  setTimeout(() => div.remove(), 4300);

  flash.className = `alarm-flash on${event.status === 'warn' ? ' warn' : ''}`;
  setTimeout(() => { flash.className = 'alarm-flash'; }, 650);

  Alarm.fire(event.status, event.say);
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
let dragCurrent = null;
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
  evt.preventDefault();
  dragStart = canvasPoint(evt);
  canvas.setPointerCapture(evt.pointerId);
});

// Live rubber-band box, so you can see what you are about to draw.
canvas.addEventListener('pointermove', (evt) => {
  if (!appState.drawMode || !dragStart) return;
  evt.preventDefault();
  dragCurrent = canvasPoint(evt);
});

canvas.addEventListener('pointerup', (evt) => {
  if (!appState.drawMode || !dragStart) return;
  evt.preventDefault();
  const [ex, ey] = canvasPoint(evt);
  const [sx, sy] = dragStart;
  const rect = {
    x: Math.min(sx, ex),
    y: Math.min(sy, ey),
    w: Math.abs(ex - sx),
    h: Math.abs(ey - sy),
  };
  dragStart = null;
  dragCurrent = null;
  if (rect.w < 10 || rect.h < 10) return;

  pendingRect = rect;
  const zoneName = appState.drawMode === 'exit' ? 'exit' : 'restricted';
  const type = appState.drawMode === 'exit' ? 'obstruction' : 'zone_intrusion';
  const say = appState.drawMode === 'exit'
    ? 'Keep the exit clear. Do not block this path.'
    : 'Stop. Do not go there. This is a restricted area.';

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
ruleJsonPreview.addEventListener('click', () => {
  clearTimeout(ruleJsonPreview._hide);
  ruleJsonPreview.style.display = 'none';
});

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
    // It covers the camera, which is the thing we are demonstrating. Show it long
    // enough to read and photograph, then get out of the way. Tap dismisses sooner.
    clearTimeout(ruleJsonPreview._hide);
    ruleJsonPreview._hide = setTimeout(() => { ruleJsonPreview.style.display = 'none'; }, 12000);
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

// Sound check only — deliberately does not touch the tally or the event log.
$('testAlarmBtn').addEventListener('click', () => {
  Alarm.unlock();
  Alarm.fire('breach', 'Stop. Do not go there. This is a restricted area.');
  flash.className = 'alarm-flash on';
  setTimeout(() => { flash.className = 'alarm-flash'; }, 650);
});

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
  if (typeof ruleEngine.setFrameSize === 'function') ruleEngine.setFrameSize(canvas.width, canvas.height);
}

function drawZones() {
  // the box being dragged right now, before it is named and saved
  if (dragStart && dragCurrent) {
    const [sx, sy] = dragStart, [cx, cy] = dragCurrent;
    ctx.save();
    ctx.strokeStyle = '#f0ad2a';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(Math.min(sx, cx), Math.min(sy, cy), Math.abs(cx - sx), Math.abs(cy - sy));
    ctx.restore();
  }

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
