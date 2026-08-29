# NOW — what to do this hour

Update this file as you go. It is the "where were we" note for a fresh session.

## Status

- [x] Repo created, 29 Aug 11:18 IST
- [x] Termux installed, 12:03 IST (GitHub release APK)
- [x] llama-server on the phone, 12:22 IST — installed via `pkg install llama-cpp`, NOT built from source (clang 21 ICE on ggml repack.cpp)
- [x] Qwen 3B downloaded, 12:10 IST (1.8 GB in 1m49s) — 1.5B fallback pending
- [ ] `llama-server` answers `curl` on 127.0.0.1:8080
- [ ] tfjs + coco-ssd weights vendored into `vendor/`
- [ ] App shell served by `llama-server --path ./app`
- [ ] Camera feed rendering on the phone
- [ ] Detection loop running
- [ ] First LLM round trip from the app
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

_(write them here so a new session sees them immediately)_

## Decisions made

- Serving the app from `llama-server --path` so app and model share an origin —
  kills CORS, mixed content and the camera secure-context problem in one move.
