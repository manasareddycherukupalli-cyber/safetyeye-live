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
  dark: false,
  warnings: 0,
  breaches: 0,
  latency: null,
  events: [],
};

/* ---------- screen wake lock ----------
   A propped phone hits the Android display timeout in 30s, and Chrome stops
   firing requestAnimationFrame the instant the page is hidden. The detection
   loop just stops — while the HUD still reads "Watching". That is the one
   failure this app must never have, so the lock is held whenever we are armed.

   The browser releases the lock every time the page hides, so it has to be
   re-acquired on visibilitychange rather than taken once and trusted. Nothing
   here survives the power button: that is an OS decision, and the honest
   response is to report the gap afterwards, not to pretend it did not happen. */
const ScreenLock = (() => {
  const supported = 'wakeLock' in navigator;
  let sentinel = null;

  const held = () => sentinel !== null;

  async function acquire() {
    if (!supported || sentinel) return held();
    try {
      sentinel = await navigator.wakeLock.request('screen');
      // Fires on a hide, a tab switch, or the OS taking it back.
      sentinel.addEventListener('release', () => { sentinel = null; paintStats(); });
    } catch (err) {
      // Battery saver and a backgrounded page both refuse. Not fatal — the app
      // keeps working, it just cannot promise the screen stays awake.
      sentinel = null;
      console.warn('[SafetyEye] screen wake lock refused:', err.message);
    }
    paintStats();
    return held();
  }

  async function release() {
    if (!sentinel) return;
    try { await sentinel.release(); } catch (err) { /* already gone */ }
    sentinel = null;
    paintStats();
  }

  return { acquire, release, held, supported };
})();

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
  const watchClass = appState.dark ? 'alarm' : 'armed';
  hudState.className = `hud-pill ${appState.armed ? watchClass : 'idle'}`;
  hudState.innerHTML = appState.armed
    ? `<span class="dot pulse"></span> ${appState.dark ? 'Too dark' : 'Watching'}`
    : '<span class="dot pulse"></span> Not started';
  $('hudSrc').textContent = appState.source === 'camera' ? 'Camera' : 'Demo scene';
  const hudLock = $('hudLock');
  if (!ScreenLock.supported) {
    hudLock.textContent = 'No wake lock';
    hudLock.className = 'hud-pill idle';
  } else if (!appState.armed) {
    hudLock.textContent = 'Screen free';
    hudLock.className = 'hud-pill src';
  } else if (ScreenLock.held()) {
    hudLock.textContent = 'Screen held';
    hudLock.className = 'hud-pill armed';
  } else {
    hudLock.textContent = 'May sleep';
    hudLock.className = 'hud-pill alarm';
  }
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
  if (appState.armed) {
    // Requested inside the click: the lock needs a visible, active document,
    // and a user gesture is the one moment that is guaranteed.
    ScreenLock.acquire();
    setStatus('watching for rule breaches');
    Alarm.say('Now watching.');
  } else {
    ScreenLock.release();
    setStatus('watching paused');
  }
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

// `zoned: false` entries are about the monitoring itself, not about a place on
// the site, so naming a zone next to them would read as a false alarm.
const LOG_KINDS = {
  breach: { color: 'var(--red)', title: 'Breach', zoned: true },
  warn: { color: 'var(--amber)', title: 'Warning', zoned: true },
  gap: { color: 'var(--dim)', title: 'Not watching', zoned: false },
  dark: { color: 'var(--blue)', title: 'Too dark', zoned: false },
};

function renderLog() {
  const logList = $('logList');
  if (!appState.events.length) {
    logList.innerHTML = '<div class="empty"><b>Nothing has happened yet</b><small>Anything the camera catches will show up here straight away.</small></div>';
    return;
  }
  logList.innerHTML = appState.events.map((event) => {
    const kind = LOG_KINDS[event.status] || LOG_KINDS.warn;
    const color = kind.color;
    const heading = kind.zoned ? `${kind.title} | ${event.rule?.zone || 'unknown'}` : kind.title;
    const time = new Date(event.ts || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    return `<div class="inc">
      <div class="bar" style="background:${color}"></div>
      <div class="body">
        <div class="t" style="color:${color}">${heading}</div>
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

// Rules are created by hand: drag a box on the camera, then fill in the zone form.
// Speech output below is the browser's local text-to-speech and stays on-device.
function speakWarning(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

// Sound check only — deliberately does not touch the tally or the event log.
$('testAlarmBtn').addEventListener('click', () => {
  Alarm.unlock();
  Alarm.fire('breach', 'Stop. Do not go there. This is a restricted area.');
  flash.className = 'alarm-flash on';
  setTimeout(() => { flash.className = 'alarm-flash'; }, 650);
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

/* ---------- light meter ----------
   A phone camera has no infrared. Past a certain darkness COCO-SSD simply stops
   returning anything, and "no detections" is indistinguishable from "nobody is
   there" — the app would sit looking calm and confident while seeing nothing.
   Measuring the picture is the only way to tell those two apart.

   One 32x24 downscale a second costs far less than a detection pass, and average
   luma is enough to know whether any usable signal is left.

   Two thresholds, not one: a single cutoff flickers on and off at dusk, or every
   time someone walks past a lamp. It goes dark below DARK_ENTER, and is only
   called usable again above the higher DARK_EXIT — and either verdict has to
   hold for a few samples before it counts. */
const LightMeter = (() => {
  const SAMPLE_MS = 1000;
  const DARK_ENTER = 42; // average luma, 0-255
  const DARK_EXIT = 58;
  const HOLD_SAMPLES = 3;

  const pad = document.createElement('canvas');
  pad.width = 32;
  pad.height = 24;
  const padCtx = pad.getContext('2d', { willReadFrequently: true });

  let lastSampleAt = 0;
  let agreeing = 0;
  let level = null;

  function read() {
    padCtx.drawImage(video, 0, 0, pad.width, pad.height);
    const { data } = padCtx.getImageData(0, 0, pad.width, pad.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (data.length / 4);
  }

  // True only on the sample where the verdict actually flips.
  function sample(now) {
    if (now - lastSampleAt < SAMPLE_MS) return false;
    if (!video.videoWidth) return false;
    lastSampleAt = now;

    try {
      level = read();
    } catch (err) {
      return false; // frame not decodable yet
    }

    const votesDark = appState.dark ? level < DARK_EXIT : level < DARK_ENTER;
    if (votesDark === appState.dark) {
      agreeing = 0;
      return false;
    }

    agreeing += 1;
    if (agreeing < HOLD_SAMPLES) return false;
    agreeing = 0;
    appState.dark = votesDark;
    return true;
  }

  return { sample, reading: () => level };
})();

let darkSince = 0;

function onLightChange() {
  const level = Math.round(LightMeter.reading());
  if (appState.dark) {
    darkSince = Date.now();
    addEventToUi({
      status: 'dark',
      rule: { zone: 'monitoring' },
      say: `Too dark to detect reliably (brightness ${level} of 255). Light this area.`,
    });
    setStatus('too dark to monitor reliably');
    if (appState.armed) Alarm.fire('warn', 'Too dark to monitor. Add light.');
    return;
  }

  const seconds = darkSince ? Math.round((Date.now() - darkSince) / 1000) : 0;
  darkSince = 0;
  addEventToUi({
    status: 'gap',
    rule: { zone: 'monitoring' },
    say: seconds
      ? `Light restored after ${formatGap(seconds)} of unreliable cover.`
      : 'Light restored.',
  });
  setStatus('light restored — watching');
}

// Android can freeze a hidden page hard enough that the rAF chain is never
// resumed, which leaves an app that looks armed and is running nothing. The
// generation counter lets the watchdog start a fresh loop and have any stale
// one retire itself rather than both running at once.
let visionModel = null;
let visionTracker = null;
let loopGen = 0;
let lastFrameAt = 0;

async function detectLoop(model, tracker, gen) {
  if (gen !== loopGen) return; // a newer loop has taken over
  lastFrameAt = performance.now();
  const start = performance.now();
  const detections = await model.detect(video);
  const tracks = tracker.update(detections, performance.now());
  appState.latency = Math.round(performance.now() - start);
  appState.people = tracks.filter((t) => t.class === 'person').length;
  drawTracks(tracks);

  // Detection keeps running in the dark — a track found down there is still a
  // real track. What changes is the claim we are willing to make about cover.
  if (appState.source === 'camera' && LightMeter.sample(start)) onLightChange();

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
  requestAnimationFrame(() => detectLoop(model, tracker, gen));
}

function formatGap(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${mins}m ${rest}s` : `${mins}m`;
}

let hiddenSince = 0;

/* A hidden page is a frozen detection loop, so time spent hidden is time we
   were not watching. Resume, but say so: the log must never imply cover we
   did not have. Same fail-loud reasoning as blurring the whole frame. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (appState.armed && !hiddenSince) hiddenSince = Date.now();
    return;
  }

  // Back in front, and the browser dropped the lock on the way out.
  if (appState.armed) ScreenLock.acquire();

  if (hiddenSince) {
    const seconds = Math.round((Date.now() - hiddenSince) / 1000);
    hiddenSince = 0;
    // Under two seconds is a tab flick, not a gap in cover.
    if (seconds >= 2) {
      addEventToUi({
        status: 'gap',
        rule: { zone: 'monitoring' },
        say: `Stopped for ${formatGap(seconds)} — the screen was off or the app was in the background.`,
      });
      setStatus(`resumed after a ${formatGap(seconds)} gap`);
    }
  }

  if (visionModel && performance.now() - lastFrameAt > 2000) {
    loopGen += 1;
    detectLoop(visionModel, visionTracker, loopGen);
  }
});

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
    visionModel = model;
    visionTracker = tracker;
    loading.classList.add('hide');
    setStatus('ready');
    detectLoop(model, tracker, loopGen);
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
