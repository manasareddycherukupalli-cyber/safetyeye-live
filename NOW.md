# NOW — what to do this hour

Update this file as you go. It is the "where were we" note for a fresh session.

## Status

- [x] Repo created, 29 Aug 11:18 IST
- [x] Termux installed, 12:03 IST (GitHub release APK)
- [x] tfjs + coco-ssd weights vendored, duplicate removed, and moved to `app/vendor/`
  at 13:45 IST so the static server's document root can actually serve them.
  All references now `./vendor/...` (index.html, sw.js, vision.js).
- [x] App shell served from `app/` on 127.0.0.1:8080 — **confirmed on device 14:50 IST**
- [x] Camera feed rendering on the phone — **confirmed live on device 15:02 IST**
- [x] Detection loop running — **confirmed on device 15:02 IST**: people at 90%/52%,
  laptop and mouse detected, persistent track IDs (#97, #98, #107, #108) holding across
  frames, trajectory markers drawn. Weights loaded from `app/vendor/`, no network.
- [x] Zone geometry + rule engine (zone_intrusion, occupancy, obstruction, proximity) with manual click-drag zone drawing UI
- [x] Spoken warning fires before a crossing (speechSynthesis hooked into showAlert; predicted-position warn already fires before actual crossing)
- [x] Event log persists across reload — `log.js` schema v2: separate `events` and
  `frames` stores, indexes on ts/status/zone/session, v1→v2 migration that moves inline
  snapshots rather than dropping them, frame pruning at 200. 17 assertions pass against
  fake-indexeddb, including report.js reading back what log.js writes.
- [x] Mesh relay + second phone console — `server/relay.py` (stdlib only, smoke-tested
  with curl: POST/GET/since/health/CORS preflight, snapshots stripped) and `app/mesh.js`
  + `app/supervisor.html`. Not yet run phone-to-phone over a real hotspot.
- [x] Screen wake lock while armed, re-acquired on `visibilitychange`, plus a
  watchdog that restarts the detection loop if Android froze the rAF chain. Gaps in
  cover are logged as "Not watching" instead of being hidden. **Untested on device.**
- [x] Low-light detection — average luma sampled once a second, hysteresis so dusk
  does not flap, HUD turns red and the log records "Too dark". Thresholds (42 enter /
  58 exit) were picked by eye and **need calibrating against the real venue**.
- [x] Shift report generated on-device (report.js: summary math verified against demo script's own numbers, breach snapshots fully blurred)
- [ ] README with attribution
- [ ] Submitted on Reskilll (Surendra only)
- [ ] Repo public, checked while signed out

## Split

**Manasa** — phone side: Termux, serving the app, `server/relay.py`, `app/log.js`,
`app/mesh.js`, `app/supervisor.{html,js}`.

**Surendra** — app side: `app/index.html`, `app/app.js`, `app/vision.js`,
`app/rules.js`, `app/report.js`, UI.

## Blockers

- Surendra's laptop camera is not working — can't visually test getUserMedia locally.
  Not a real blocker: the phone camera is the actual target device. First live camera
  test happens on the phone at 14:00 RED window instead.

- ~~vendor/ is outside the server's document root.~~ **Fixed 13:45 IST** —
  `vendor/` moved to `app/vendor/` (git mv, history preserved), every reference rewritten
  from `../vendor/...` to `./vendor/...`.

- **Two phones have never talked to each other.** Relay and both clients are written and
  tested locally; the phone-to-phone run over a hotspot is untested.

## Decisions made

- Serving the app on `127.0.0.1` — kills mixed content and the camera secure-context
  problem in one move, with no tunnel and no certificate.

- **Nothing is generated in the warning path.** The `say` string is written once when
  the rule is created and spoken from storage at runtime.
- **Phone gets code by `git pull`, not by copying files.** The repo is cloned into
  `~/safetyeye` in Termux and the static server serves `~/safetyeye/app` directly.
  Push from the laptop, pull on the phone, refresh Chrome.

## Demo-state note (from server/README.md)

Aeroplane mode and the two-phone mesh coexist, but only if said plainly: on Android,
Wi-Fi can be switched back on while aeroplane mode stays on. That is the demo state —
no mobile data, no internet, one local hotspot between the phones. Rehearse the wording
before a judge asks.
