# test/ — the bits that can be checked without a phone

Two things in this project can be tested honestly on a laptop: the storage schema and
the mesh wire protocol. Camera, detection and the model need the device.

## log.test.mjs — storage

```
npm install fake-indexeddb
node test/log.test.mjs
```

Seeds a v1 database, opens it with the current `app/log.js`, and asserts the v1 -> v2
migration keeps the old rows and their snapshots. Then checks the indexes, the
frames/events split, `withFrames: false`, session scoping, frame pruning, and that
`report.js` reads back exactly what `log.js` wrote.

## mesh.test.mjs — site phone to supervisor phone

```
python3 server/relay.py --host 127.0.0.1 --port 8099 &
node test/mesh.test.mjs 8099
```

Runs the real `app/mesh.js` against the real relay: a breach published by a site phone
arrives at a supervisor, the `since=<seq>` cursor doesn't redeliver it, the blurred
frame is stripped before it leaves, and an unreachable relay returns false instead of
throwing into the detection loop.

Start the relay fresh — the store is in-memory and a relay left over from a previous
run will still be holding that run's events.
