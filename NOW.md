# NOW — what to do this hour

Update this file as you go. It is the "where were we" note for a fresh session.

## Status

- [x] Repo created, 29 Aug 11:18 IST
- [x] Termux installed, 12:03 IST (GitHub release APK)
- [x] llama-server on the phone, 12:22 IST — installed via `pkg install llama-cpp`, NOT built from source (clang 21 ICE on ggml repack.cpp)
- [x] Qwen 3B downloaded, 12:10 IST (1.8 GB in 1m49s) — 1.5B fallback pending
- [x] `llama-server` answers `curl` on 127.0.0.1:8080, 12:47 IST — 18.5 tok/s prompt, 15.6 tok/s gen, ~2.7s round trip on 3B
- [x] tfjs + coco-ssd weights vendored, duplicate removed, and moved to `app/vendor/`
  at 13:45 IST so `llama-server --path ~/safetyeye/app` can actually serve them.
  All references now `./vendor/...` (index.html, sw.js, vision.js).
- [x] App shell served by `llama-server --path ./app` — **confirmed on device 14:50 IST**
- [x] Camera feed rendering on the phone — **confirmed live on device 15:02 IST**
- [x] Detection loop running — **confirmed on device 15:02 IST**: people at 90%/52%,
  laptop and mouse detected, persistent track IDs (#97, #98, #107, #108) holding across
  frames, trajectory markers drawn. Weights loaded from `app/vendor/`, no network.
- [x] Zone geometry + rule engine (zone_intrusion, occupancy, obstruction, proximity) with manual click-drag zone drawing UI as a stand-in for voice input
- [x] First LLM round trip from the app (app.js -> llm.js, verified against a fake local server; still needs one real check against the phone's llama-server)
- [x] Speech/typed rule → JSON rules — Manasa's phone-tested `llm.js` (`LLM.compileRules`) is now the
  canonical implementation: real constrained decoding, zone-aware prompt, tested at 15.6 tok/s on-device
- [x] Spoken warning fires before a crossing (speechSynthesis hooked into showAlert; predicted-position warn already fires before actual crossing)
- [x] Event log persists across reload — `log.js` schema v2: separate `events` and
  `frames` stores, indexes on ts/status/zone/session, v1→v2 migration that moves inline
  snapshots rather than dropping them, frame pruning at 200. 17 assertions pass against
  fake-indexeddb, including report.js reading back what log.js writes.
- [x] Mesh relay + second phone console — `server/relay.py` (stdlib only, smoke-tested
  with curl: POST/GET/since/health/CORS preflight, snapshots stripped) and `app/mesh.js`
  + `app/supervisor.html`. Not yet run phone-to-phone over a real hotspot.
- [x] Shift report generated on-device (report.js: summary math verified against demo script's own numbers, breach snapshots fully blurred)
- [ ] README with attribution
- [ ] Submitted on Reskilll (Surendra only)
- [ ] Repo public, checked while signed out

## Split

**Manasa** — phone side: Termux, llama.cpp, models, `server/relay.py`, `app/llm.js`,
`app/log.js`, `app/mesh.js`, `app/supervisor.{html,js}`.

**Surendra** — app side: `app/index.html`, `app/app.js`, `app/vision.js`,
`app/rules.js`, `app/report.js`, UI.

## Blockers

- Surendra's laptop camera is not working — can't visually test getUserMedia locally.
  Not a real blocker: the phone camera is the actual target device. First live camera
  test happens on the phone at 14:00 RED window instead.

- ~~vendor/ is outside what llama-server actually serves.~~ **Fixed 13:45 IST** —
  `vendor/` moved to `app/vendor/` (git mv, history preserved), every reference rewritten
  from `../vendor/...` to `./vendor/...`.

- **1.5B fallback model still not downloaded.** The 3B runs at 15.6 tok/s, which is
  fine, but the fallback is the insurance for a slow demo and it needs the network —
  so it has to happen in a GREEN window, on the phone, not later.

- **Two phones have never talked to each other.** Relay and both clients are written and
  tested locally; the phone-to-phone run over a hotspot is untested.

## Decisions made

- Serving the app from `llama-server --path` so app and model share an origin —
  kills CORS, mixed content and the camera secure-context problem in one move.

- **LLM is never in the warning path.** 15.6 tok/s means a generated warning arrives
  after the person has already crossed. The `say` string is written once at rule-compile
  time and spoken from storage at runtime. LLM handles understanding (rules, report,
  Q&A), never reaction.
- **Phone gets code by `git pull`, not by copying files.** The repo is cloned into
  `~/safetyeye` in Termux and `llama-server --path ~/safetyeye/app` serves it directly.
  Push from the laptop, pull on the phone, refresh Chrome.

## Demo-state note (from server/README.md)

Aeroplane mode and the two-phone mesh coexist, but only if said plainly: on Android,
Wi-Fi can be switched back on while aeroplane mode stays on. That is the demo state —
no mobile data, no internet, one local hotspot between the phones. Rehearse the wording
before a judge asks.
