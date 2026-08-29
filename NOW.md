# NOW — what to do this hour

Update this file as you go. It is the "where were we" note for a fresh session.

## Status

- [x] Repo created, 29 Aug 11:18 IST
- [x] Termux installed, 12:03 IST (GitHub release APK)
- [x] llama-server on the phone, 12:22 IST — installed via `pkg install llama-cpp`, NOT built from source (clang 21 ICE on ggml repack.cpp)
- [x] Qwen 3B downloaded, 12:10 IST (1.8 GB in 1m49s) — 1.5B fallback pending
- [x] `llama-server` answers `curl` on 127.0.0.1:8080, 12:47 IST — 18.5 tok/s prompt, 15.6 tok/s gen, ~2.7s round trip on 3B
- [x] tfjs + coco-ssd weights vendored — done independently on both sides at different paths
  (Surendra: `vendor/tfjs/`, `vendor/coco-ssd/model/`; Manasa: `vendor/tf.min.js`, `vendor/coco-ssd/`,
  documented in `vendor/README.md`). **Needs consolidating to one path — see blocker below,
  vendor/ currently sits outside what `llama-server --path ./app` can actually serve.**
- [ ] App shell served by `llama-server --path ./app` (shell built; blocked on the same path issue)
- [ ] Camera feed rendering on the phone (code written, untestable on laptop — no working laptop camera; first real test on phone)
- [x] Detection loop running (COCO-SSD + IoU tracker + 0.75s trajectory prediction, verified with node logic tests)
- [x] Zone geometry + rule engine (zone_intrusion, occupancy, obstruction, proximity) with manual click-drag zone drawing UI as a stand-in for voice input
- [x] First LLM round trip from the app (app.js -> llm.js, verified against a fake local server; still needs one real check against the phone's llama-server)
- [x] Speech/typed rule → JSON rules — Manasa's phone-tested `llm.js` (`LLM.compileRules`) is now the
  canonical implementation: real constrained decoding, zone-aware prompt, tested at 15.6 tok/s on-device
- [x] Spoken warning fires before a crossing (speechSynthesis hooked into showAlert; predicted-position warn already fires before actual crossing)
- [x] Event log persists across reload (IndexedDB in log.js — placeholder, Manasa to review schema)
- [ ] Mesh relay + second phone console
- [x] Shift report generated on-device (report.js: summary math verified against demo script's own numbers, breach snapshots fully blurred)
- [ ] README with attribution
- [ ] Submitted on Reskilll (Surendra only)
- [ ] Repo public, checked while signed out

## Split

**Manasa** — phone side: Termux, llama.cpp, models, `server/relay.py`, `app/llm.js`,
`app/log.js`, `app/mesh.js`.

**Surendra** — app side: `app/index.html`, `app/app.js`, `app/vision.js`,
`app/rules.js`, `app/report.js`, UI.

## Blockers

- Surendra's laptop camera is not working — can't visually test getUserMedia locally.
  Not a real blocker: the phone camera is the actual target device. First live camera
  test happens on the phone at 14:00 RED window instead.

- **vendor/ is outside what llama-server actually serves.** `llama-server --path ./app`
  only serves the `app/` folder, but both vendored copies (Surendra's and Manasa's) sit
  at the repo root, a sibling of `app/`. Neither `../vendor/...` nor `/vendor/...` would
  resolve once this runs for real. Fix: move vendor/ to be `app/vendor/`, pick one copy,
  update path references. Not yet done — flagged, not fixed, pending confirmation.

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
