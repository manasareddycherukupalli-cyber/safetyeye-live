// mesh.js — the client half of the phone-to-phone mesh.
//
// Every phone runs its own full stack. What travels between them is events,
// never video: getUserMedia is refused on any non-localhost origin, so the
// camera has to stay on the device that renders it (CLAUDE.md, "Mesh").
//
// Two roles, one file:
//   publisher  — a site phone, POSTing each logged event to server/relay.py
//   subscriber — the supervisor phone, polling GET /events?since=<seq> at 1 Hz
//
// A phone can do both. Nothing here is in the reaction path: if the relay is
// unreachable the site phone still detects, still warns, still logs to its own
// IndexedDB. The mesh is a view onto the demo, never a dependency of it.

const Mesh = (() => {
  const SETTINGS_KEY = 'safetyeye.mesh';
  const POLL_MS = 1000;
  const BACKOFF_MS = 5000; // after a failed poll, ease off rather than hammering

  let settings = load();
  let seq = 0;
  let polling = false;
  let timer = null;
  const listeners = { event: [], status: [] };

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        relayUrl: stored.relayUrl || '',
        device: stored.device || `phone-${Math.random().toString(36).slice(2, 6)}`,
      };
    } catch {
      return { relayUrl: '', device: 'phone' };
    }
  }

  function save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn('[mesh] settings not persisted', err);
    }
  }

  // Accepts "192.168.1.7:8090" as well as a full URL — at 19:00 with a judge
  // watching, nobody should be typing "http://" on a phone keyboard.
  function normalizeUrl(input) {
    const trimmed = (input || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  }

  function configure({ relayUrl, device } = {}) {
    if (relayUrl !== undefined) settings.relayUrl = normalizeUrl(relayUrl);
    if (device) settings.device = device;
    save();
    emit('status', state());
    return state();
  }

  function state() {
    return { ...settings, connected: polling, seq };
  }

  function on(name, fn) {
    (listeners[name] || (listeners[name] = [])).push(fn);
    return () => off(name, fn);
  }

  function off(name, fn) {
    listeners[name] = (listeners[name] || []).filter((f) => f !== fn);
  }

  function emit(name, payload) {
    for (const fn of listeners[name] || []) {
      try {
        fn(payload);
      } catch (err) {
        console.error('[mesh] listener threw', err);
      }
    }
  }

  // --- Publishing ------------------------------------------------------------

  // Snapshots are stripped before the event leaves the device. A breach frame is
  // ~50 KB of base64 and, more to the point, blurred stills of workers should not
  // be flying across a venue Wi-Fi to keep a live tile updated. The relay drops
  // the field too; this is the belt to its braces.
  function wireFormat(event) {
    return {
      device: settings.device,
      ts: event.timestamp || Date.now(),
      status: event.status,
      say: event.say || event.rule?.say || '',
      rule: event.rule
        ? { zone: event.rule.zone, type: event.rule.type, severity: event.rule.severity }
        : undefined,
      trackIds: event.trackIds,
    };
  }

  async function publish(event) {
    if (!settings.relayUrl) return false; // single-phone demo: silently a no-op
    try {
      const res = await fetch(`${settings.relayUrl}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wireFormat(event)),
      });
      return res.ok;
    } catch (err) {
      console.warn('[mesh] publish failed (detection is unaffected)', err.message);
      return false;
    }
  }

  // --- Subscribing -----------------------------------------------------------

  async function pollOnce() {
    const res = await fetch(`${settings.relayUrl}/events?since=${seq}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`relay returned ${res.status}`);
    const data = await res.json();
    for (const event of data.events || []) {
      seq = Math.max(seq, event.seq);
      emit('event', event);
    }
    if (typeof data.seq === 'number') seq = Math.max(seq, data.seq);
  }

  function start() {
    if (!settings.relayUrl) throw new Error('no relay URL set');
    stop();
    polling = true;
    emit('status', state());

    const tick = async () => {
      if (!polling) return;
      let wait = POLL_MS;
      try {
        await pollOnce();
        emit('status', { ...state(), reachable: true });
      } catch (err) {
        wait = BACKOFF_MS;
        emit('status', { ...state(), reachable: false, error: err.message });
      }
      if (polling) timer = setTimeout(tick, wait);
    };
    tick();
  }

  function stop() {
    polling = false;
    if (timer) clearTimeout(timer);
    timer = null;
    emit('status', state());
  }

  // Replay from the beginning — used when the supervisor phone joins late and
  // should still see the shift so far, not just what happens from now on.
  function rewind() {
    seq = 0;
  }

  // --- Auto-wiring the site phone -------------------------------------------
  //
  // Every event that reaches the local log is also worth publishing, and the
  // logging call site already applies the alert cooldown — so wrapping
  // SafetyEyeLog.logEvent gets the mesh exactly the events the supervisor should
  // see, with no changes to app.js. The publish is fire-and-forget: the local
  // write is awaited and returned, the network is not.
  function attachToLog() {
    const log = typeof window !== 'undefined' && window.SafetyEyeLog;
    if (!log || log.__meshAttached) return;
    const original = log.logEvent;
    log.logEvent = async function meshLogEvent(event) {
      const result = await original.call(this, event);
      publish(event);
      return result;
    };
    log.__meshAttached = true;
  }

  return { configure, state, publish, start, stop, rewind, on, off, attachToLog, normalizeUrl };
})();

if (typeof window !== 'undefined') {
  window.Mesh = Mesh;
  Mesh.attachToLog();
}
