// Exercises app/log.js against a real IndexedDB implementation, including the
// v1 -> v2 upgrade path.
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = new URL('../app/log.js', import.meta.url);
const REPORT = new URL('../app/report.js', import.meta.url);

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  ', msg);
}

// --- seed a v1 database first, so the upgrade path is what gets exercised ---
await new Promise((resolve, reject) => {
  const r = indexedDB.open('safetyeye', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
  r.onsuccess = () => {
    const db = r.result;
    const tx = db.transaction('events', 'readwrite');
    tx.objectStore('events').add({ status: 'breach', rule: { zone: 'press' }, timestamp: 1000, snapshot: 'data:old' });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
  r.onerror = () => reject(r.error);
});

const ctx = { indexedDB, IDBKeyRange, navigator: {}, console, window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
vm.runInContext(fs.readFileSync(REPORT, 'utf8'), ctx);
const Log = ctx.window.SafetyEyeLog;
const Report = ctx.window.SafetyEyeReport;

const id1 = await Log.logEvent({ status: 'warn', rule: { zone: 'press', type: 'zone_intrusion' }, say: 'Step back' });
const id2 = await Log.logEvent({ status: 'breach', rule: { zone: 'press' }, say: 'Step back', snapshot: 'data:new' });
await Log.logEvent({ status: 'warn', rule: { zone: 'exit' }, say: 'Clear the exit' });

assert(typeof id1 === 'number' && id2 === id1 + 1, 'logEvent returns autoincrement ids');

const all = await Log.getEvents();
assert(all.length === 4, `v1 row migrated, not dropped (got ${all.length})`);

const migrated = all.find((e) => e.ts === 1000);
assert(migrated && migrated.snapshot === 'data:old', 'v1 inline snapshot survived into frames store');
assert(migrated.zone === 'press' && migrated.session === 'pre-v2', 'v1 row backfilled with zone/session');

const fresh = all.find((e) => e.id === id2);
assert(fresh.snapshot === 'data:new', 'snapshot rejoined from frames store');
assert(fresh.hasFrame === true, 'hasFrame set on breach with a frame');

const noFrames = await Log.getEvents({ withFrames: false });
assert(noFrames.every((e) => e.snapshot === undefined), 'withFrames:false keeps base64 out of LLM prompts');

const session = await Log.getSessionEvents();
assert(session.length === 3 && !session.some((e) => e.session === 'pre-v2'), 'getSessionEvents excludes the old shift');

assert((await Log.countByStatus('warn')) === 2, 'countByStatus uses the status index');

const since = await Log.getEvents({ since: Date.now() - 1000 });
assert(since.length === 3, 'since range excludes the 1970 v1 row');

// report.js reads what log.js writes — that contract is the whole point
const summary = Report.summarize(session);
assert(summary.totalWarnings === 2 && summary.totalBreaches === 1, 'report tallies match the log');
assert(summary.byZone.press.warnings === 1 && summary.byZone.press.breaches === 1, 'per-zone table intact');
assert(summary.breachEvents[0].snapshot === 'data:new', 'report still finds breach snapshots');

const dropped = await Log.pruneFrames(1);
assert(dropped === 1, 'pruneFrames drops the oldest frame');
const afterPrune = await Log.getEvents();
assert(afterPrune.length === 4, 'pruning frames never removes event rows');
assert(afterPrune.find((e) => e.ts === 1000).hasFrame === false, 'hasFrame corrected after eviction');

await Log.clearEvents();
assert((await Log.getEvents()).length === 0, 'clearEvents empties both stores');

console.log(process.exitCode ? '\nSOME TESTS FAILED' : '\nall log.js tests passed');
