// Site phone -> relay -> supervisor phone, using the real mesh.js against a
// real running relay.py.
import fs from 'node:fs';
import vm from 'node:vm';

const PORT = process.argv[2];
const store = {};
function makeMesh() {
  const ctx = {
    console, fetch, setTimeout, clearTimeout, localStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../app/mesh.js', import.meta.url), 'utf8'), ctx);
  return ctx.window.Mesh;
}

let bad = 0;
const assert = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

const site = makeMesh();
site.configure({ relayUrl: `127.0.0.1:${PORT}`, device: 'site-1' });

// exactly what app.js hands to SafetyEyeLog.logEvent for a breach
const published = await site.publish({
  status: 'breach',
  rule: { zone: 'press', type: 'zone_intrusion', severity: 'critical', say: 'Step back from the press' },
  trackIds: [3],
  snapshot: 'data:image/jpeg;base64,' + 'A'.repeat(40000),
});
assert(published === true, 'site phone publishes a breach');

const supervisor = makeMesh();
supervisor.configure({ relayUrl: `127.0.0.1:${PORT}`, device: 'supervisor' });
const seen = [];
supervisor.on('event', (e) => seen.push(e));
supervisor.rewind();
supervisor.start();
await new Promise((r) => setTimeout(r, 1500));
supervisor.stop();

assert(seen.length === 1, `supervisor received the event (got ${seen.length})`);
assert(seen[0]?.device === 'site-1', 'event carries the publishing device');
assert(seen[0]?.rule?.zone === 'press', 'zone survives the wire format');
assert(seen[0]?.say === 'Step back from the press', 'the spoken line survives');
assert(seen[0]?.snapshot === undefined, 'the blurred frame never left the phone');

// second poll must not redeliver
const before = seen.length;
supervisor.start();
await new Promise((r) => setTimeout(r, 1200));
supervisor.stop();
assert(seen.length === before, 'since=<seq> means no duplicates on the next poll');

// unreachable relay must not throw into the caller
const orphan = makeMesh();
orphan.configure({ relayUrl: '127.0.0.1:1', device: 'x' });
assert((await orphan.publish({ status: 'warn' })) === false, 'unreachable relay returns false, never throws');

console.log(bad ? '\nSOME TESTS FAILED' : '\nall mesh tests passed');
process.exit(bad ? 1 : 0);
