# NOW — what to do this hour

Update this file as you go. It is the "where were we" note for a fresh session.

## Status

- [x] Repo created, 29 Aug 11:18 IST
- [ ] Termux installed (F-Droid build, NOT Play Store)
- [ ] llama.cpp built on the phone
- [ ] Qwen 3B + 1.5B GGUF downloaded to the phone
- [ ] `llama-server` answers `curl` on 127.0.0.1:8080
- [x] tfjs + coco-ssd weights vendored into `vendor/` (verified: all local, 0 CDN calls)
- [ ] App shell served by `llama-server --path ./app` (shell built, awaiting Manasa's llama-server)
- [ ] Camera feed rendering on the phone (code written, untestable on laptop — no working laptop camera)
- [x] Detection loop running (COCO-SSD + IoU tracker + 0.75s trajectory prediction, verified with node logic tests)
- [x] Zone geometry + rule engine (zone_intrusion, occupancy, obstruction, proximity) with manual click-drag zone drawing UI as a stand-in for voice input
- [x] First LLM round trip from the app (app.js -> llm.js chatCompletion(), verified against a fake local server; needs Manasa's real llama-server to fully confirm)
- [ ] Speech/typed rule → JSON rules
- [ ] Spoken warning fires before a crossing
- [ ] Event log persists across reload
- [ ] Mesh relay + second phone console
- [ ] Shift report generated on-device
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

## Decisions made

- Serving the app from `llama-server --path` so app and model share an origin —
  kills CORS, mixed content and the camera secure-context problem in one move.
