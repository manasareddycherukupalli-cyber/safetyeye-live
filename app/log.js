// log.js — the durable record of a shift, on the phone, in IndexedDB.
//
// This is the only thing that survives a reload, a lock screen, or Android
// killing the tab mid-demo, and the shift report is written from it. The relay
// (server/relay.py) keeps nothing; losing it costs the live supervisor view and
// no data.
//
// Two stores, deliberately:
//   events  — small records, indexed, cheap to scan for the report
//   frames  — the blurred breach snapshots, ~50 KB of base64 each
// Keeping frames out of `events` means summarize() and askLog() can read a whole
// shift without dragging megabytes of image data through memory, and it lets the
// frames be pruned on their own when storage runs short.
//
// Schema v2. v1 stored one flat `events` store with the snapshot inline; the
// upgrade path below moves those records across rather than dropping them,
// because the first thing anyone does after a schema change is reload the page
// they were demoing.

const SafetyEyeLog = (() => {
  const DB_NAME = 'safetyeye';
  const DB_VERSION = 2;
  const EVENTS = 'events';
  const FRAMES = 'frames';

  // A frame per breach at ~50 KB: 200 is roughly 10 MB, well inside the origin
  // quota, and more breaches than any three-minute demo will ever produce.
  const MAX_FRAMES = 200;

  // One id per app start, so the report can tell "this shift" from a leftover
  // log without needing wall-clock heuristics.
  const SESSION_ID = `${new Date().toISOString().slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`;

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (evt) => {
        const db = request.result;
        const tx = request.transaction;

        let events;
        if (!db.objectStoreNames.contains(EVENTS)) {
          events = db.createObjectStore(EVENTS, { keyPath: 'id', autoIncrement: true });
        } else {
          events = tx.objectStore(EVENTS);
        }
        // ts: the report and ask-the-log both want a time range.
        // status: "how many breaches" shouldn't scan every row.
        // zone: the report's per-zone table.
        // session: separates this shift from yesterday's leftovers.
        for (const [name, keyPath] of [
          ['ts', 'ts'],
          ['status', 'status'],
          ['zone', 'zone'],
          ['session', 'session'],
        ]) {
          if (!events.indexNames.contains(name)) events.createIndex(name, keyPath);
        }

        if (!db.objectStoreNames.contains(FRAMES)) {
          db.createObjectStore(FRAMES, { keyPath: 'eventId' });
        }

        // v1 -> v2: snapshots were stored inline. Move them into `frames` and
        // backfill the fields the new indexes need.
        if (evt.oldVersion === 1) {
          const frames = tx.objectStore(FRAMES);
          events.openCursor().onsuccess = (cursorEvt) => {
            const cursor = cursorEvt.target.result;
            if (!cursor) return;
            const row = cursor.value;
            row.hasFrame = Boolean(row.snapshot);
            if (row.snapshot) {
              frames.put({ eventId: row.id, snapshot: row.snapshot });
              delete row.snapshot;
            }
            row.ts = row.ts || row.timestamp || Date.now();
            row.zone = row.zone || row.rule?.zone || 'unknown';
            row.session = row.session || 'pre-v2';
            cursor.update(row);
            cursor.continue();
          };
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked — close other SafetyEye tabs'));
    });
    return dbPromise;
  }

  function done(tx, value) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
  }

  function req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Writes the event and, if one is attached, its frame — in a single
  // transaction, so there is never a frame pointing at an event that was not
  // written, or a breach row claiming a snapshot that is missing.
  async function logEvent(event) {
    const db = await openDb();
    const { snapshot, timestamp, ...rest } = event;

    const record = {
      ...rest,
      ts: timestamp || event.ts || Date.now(),
      // Denormalised out of `rule` purely so it can be indexed — IndexedDB
      // cannot index through an optional nested object without every row
      // having one.
      zone: event.rule?.zone || 'unknown',
      status: event.status || 'warn',
      session: SESSION_ID,
      hasFrame: Boolean(snapshot),
    };

    const tx = db.transaction([EVENTS, FRAMES], 'readwrite');
    const id = await req(tx.objectStore(EVENTS).add(record));
    if (snapshot) tx.objectStore(FRAMES).put({ eventId: id, snapshot });
    await done(tx);

    if (snapshot) pruneFrames().catch((err) => console.warn('[log] frame prune failed', err));
    return id;
  }

  // withFrames defaults to true so the report keeps reading `event.snapshot`
  // exactly as it did under v1. Pass false for the LLM paths (askLog,
  // writeReport) — a base64 image in a prompt is thousands of wasted tokens at
  // 15 tok/s.
  async function getEvents({ withFrames = true, session = null, since = null } = {}) {
    const db = await openDb();
    const tx = db.transaction([EVENTS, FRAMES], 'readonly');
    const store = tx.objectStore(EVENTS);

    let rows;
    if (session) {
      rows = await req(store.index('session').getAll(session));
    } else if (since != null) {
      rows = await req(store.index('ts').getAll(IDBKeyRange.lowerBound(since)));
    } else {
      rows = await req(store.getAll());
    }

    if (withFrames) {
      const frames = tx.objectStore(FRAMES);
      await Promise.all(
        rows.filter((r) => r.hasFrame).map(async (r) => {
          const frame = await req(frames.get(r.id));
          if (frame) r.snapshot = frame.snapshot;
        })
      );
    }
    return rows;
  }

  // Current run only — what the shift report should actually be about.
  function getSessionEvents(opts = {}) {
    return getEvents({ ...opts, session: SESSION_ID });
  }

  async function countByStatus(status) {
    const db = await openDb();
    const tx = db.transaction(EVENTS, 'readonly');
    return req(tx.objectStore(EVENTS).index('status').count(status));
  }

  // Oldest frames go first; the event rows they belonged to stay, with hasFrame
  // corrected, so the counts in the report never change just because an image
  // was evicted.
  async function pruneFrames(limit = MAX_FRAMES) {
    const db = await openDb();
    const tx = db.transaction([FRAMES, EVENTS], 'readwrite');
    const frames = tx.objectStore(FRAMES);
    const total = await req(frames.count());
    if (total <= limit) return 0;

    let toDrop = total - limit;
    const events = tx.objectStore(EVENTS);
    await new Promise((resolve, reject) => {
      const cursorReq = frames.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || toDrop <= 0) return resolve();
        const eventId = cursor.value.eventId;
        cursor.delete();
        const get = events.get(eventId);
        get.onsuccess = () => {
          const row = get.result;
          if (row) {
            row.hasFrame = false;
            events.put(row);
          }
        };
        toDrop -= 1;
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    await done(tx);
    return total - limit;
  }

  async function clearEvents() {
    const db = await openDb();
    const tx = db.transaction([EVENTS, FRAMES], 'readwrite');
    tx.objectStore(EVENTS).clear();
    tx.objectStore(FRAMES).clear();
    return done(tx);
  }

  // How much of the origin quota the log is using. Worth a glance before a demo
  // — a full quota makes writes fail silently at exactly the wrong moment.
  async function usage() {
    if (!navigator.storage?.estimate) return null;
    const { usage: used, quota } = await navigator.storage.estimate();
    return { used, quota, pct: quota ? Math.round((used / quota) * 100) : null };
  }

  return {
    logEvent,
    getEvents,
    getSessionEvents,
    countByStatus,
    clearEvents,
    pruneFrames,
    usage,
    SESSION_ID,
  };
})();

window.SafetyEyeLog = SafetyEyeLog;
