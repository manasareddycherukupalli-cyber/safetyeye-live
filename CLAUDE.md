# SafetyEye — iQOO Hackathon 2026, Bengaluru City Battle

Read this first. It is the full context for this project.

## Who / what / when

- **Team Fight Club** — Surendra Avula (frontend: Next.js, React, JS) and
  Manasa Reddy (backend: APIs, databases, auth; has shipped cross-platform mobile).
- **Student bucket · Open Innovation track.**
- **Event window: 29 Aug 2026 11:00 → 30 Aug 2026 ~13:00 IST.** Hacking began 11:00 Sat.
- Shortlisted top 17 of 26 on the SafetyEye idea. Top 6 per city advance to the
  Grand Finale (Bengaluru, 9–11 Oct 2026) — **3 student teams and 3 working-professional
  teams**, so we are competing for three student slots, not six open ones. Standout
  teams beyond the Top 6 can still earn Finale slots.

## HARD RULE — why this repo exists

The playbook says: *original work only, code written during the event window; carrying
in a completed app is not allowed; organisers may verify.*

An earlier SafetyEye prototype exists at `~/Desktop/IQOO` (repo
`manasareddycherukupalli-cyber/safetyeye`) with commits dated 25 Aug and earlier.
**Do not copy code from it. Do not push here to that remote.** The idea is ours to
keep; the code is being rewritten from scratch inside the window. The earlier
prototype is disclosed in the README under pre-existing components.

Commit every 30–45 min with honest messages. The git history is the only proof the
build happened inside the window.

## What we are building

An offline workplace-safety monitor for small construction sites and factories that
cannot afford a ₹2 lakh CCTV-and-server install. Prop a phone facing a hazard; it
watches, **warns people before they cross a line**, and writes a compliance report at
shift end. Everything runs on the phone — no cloud, no server, no subscription.

The differentiator over every camera safety system on the market: they are *forensic*
(they document breaches afterwards). This one is *preventive* — it tracks trajectories,
predicts a breach ~0.75s ahead, and speaks a warning. It logs a breach only when the
warning failed, so the report leads with **incidents prevented**.

## Judging weights (drives every decision)

| Weight | Criterion | What earns it here |
|---|---|---|
| 30% | End product | It runs, on the phone, in front of them |
| 20% | Novelty | Plain speech → enforced safety rule |
| 15% | Creative phone use | HackTracker telemetry — multi-phone mesh, mic, speaker, torch |
| 15% | Technical depth | Vision + tracker + prediction + LLM, all local, backend included |
| 10% | Office Kit | Telemetry from the phone↔laptop bridge — use it deliberately |
| 10% | Demo | Rehearsed, on-device, no laptop on the table |

The organisers' own tip: *"Build apps that run locally and on-device, including the
backend, using on-device LLMs. The highest on-device builds will be preferred for the
Top 10."* The published rules confirm it: *"A local or open-source model at the core
earns brownie points"* and *"if it runs on the phone with a local or open-source model
at the core, it qualifies"* — **PWA is explicitly a welcome stack**, so serving the app
from `llama-server` is a first-class entry, not a workaround.

**Never add a cloud API call** — but not for the reason first written here. The rules
say *"AI credits for the weekend are free"*, so cost is not the argument and we must
not claim it is. The argument is the product: the entire pitch is aeroplane mode, no
cloud, no server, no subscription. One remote call and the differentiator is gone.

**We run on the CPU, not the NPU.** The rules note that *"on-device inference targets
the Snapdragon NPU"*; llama.cpp does CPU inference and gets ~15.6 tok/s on the 3B.
Chasing the NPU means the Qualcomm QNN stack and a model conversion — a day of work
that can end with nothing, traded against a stack that already works. The honest
answer for a judge: no vendor SDK, no conversion, runs on any Android device, and the
LLM is never in the reaction path, so the latency NPU would buy us is latency we do
not need.

## Architecture — the load-bearing decision

`llama-server` (from llama.cpp) serves the static app **and** answers model calls from
a single process on the phone:

```
llama-server -m qwen.gguf --path ./app --host 127.0.0.1 --port 8080
```

App loads from `http://127.0.0.1:8080/`, model API at `/v1/chat/completions` — same
origin. This is deliberate and solves three things at once:

1. **No CORS** — app and API share an origin, no preflight, no Private Network Access block.
2. **No mixed content** — no HTTPS page reaching for plain-HTTP localhost.
3. **Camera works** — `localhost` is a secure context, so `getUserMedia` is permitted
   with no tunnel and no certificate.

If Termux cannot be made to work, fall back to WebLLM over WebGPU in Chrome. **Not**
MediaPipe — it needs a native Android build, which strands us during Red Light hours.

## Stack

- **Vision:** COCO-SSD on TensorFlow.js, WebGL backend. Weights **vendored in
  `vendor/`** — nothing loads from a CDN, because the venue Wi-Fi will die.
- **LLM:** Qwen2.5-3B-Instruct Q4_K_M (~2 GB) primary; 1.5B fallback if latency hurts
  the demo. 16 GB LPDDR5X on the iQOO 15 handles 3B comfortably.
- **Rules from speech:** constrained decoding via
  `response_format: {type: "json_schema", json_schema: RULE_SCHEMA}`, temperature 0.1.
  Malformed output is made unrepresentable, not merely unlikely. This is the answer
  when a judge probes technical depth.
- **Mesh:** every phone runs its own full stack; they exchange only *events* through
  `server/relay.py` (~40 lines, `POST /event`, `GET /events?since=<seq>`, 1s poll).
  **The camera must stay on the same device that renders it** — `getUserMedia` is
  blocked on any non-localhost origin, so video never crosses the network.
- **Storage:** IndexedDB. Zones, settings, events and frames survive reload and lock.

## Rule schema

```json
{"rules": [{
  "type": "zone_intrusion | occupancy | obstruction | proximity",
  "zone": "press | exit | scaffold",
  "limit": 4,
  "severity": "warn | critical",
  "say": "Step back from the press"
}]}
```

## File layout

```
app/index.html    shell
app/app.js        orchestration, demo-mode toggle
app/vision.js     COCO-SSD · IoU tracker · 0.75s trajectory projection
app/rules.js      zone geometry, occupancy, obstruction, proximity
app/llm.js        compileRules · narrateWarning · writeReport · askLog
app/mesh.js       relay client
app/log.js        IndexedDB events + frames
app/report.js     shift report + on-device blur
app/supervisor.html + supervisor.js   second phone's console
app/vendor/       tfjs + coco-ssd weights — LOCAL, never a CDN, and INSIDE app/
                  because llama-server --path only serves what is under app/
server/relay.py   mesh event relay
```

## Known holes — decide, do not discover

- **Web Speech API sends audio to Google.** It punctures the offline claim and a judge
  will ask. Either ship a typed fallback and disclose it, or run `whisper.cpp` tiny
  (~75 MB, same toolchain as llama.cpp) in Termux. Aim for whisper; ship typed-or-spoken.
- **COCO-SSD detects people and generic objects, not hard hats.** PPE detection is the
  same pipeline with a fine-tuned model swapped in. Say this plainly; do not overclaim.
- **Anonymisation blurs the whole frame**, not detected faces — masking only detections
  makes anonymity depend on the detector succeeding, and it misses constantly. Fails closed.
- **Termux must come from F-Droid or GitHub releases.** The Play Store build is
  deprecated and will waste an hour before admitting it.
- `termux-wake-lock` or Android kills the server mid-demo.

## Schedule (from the printed playbook; timings may shift — confirm at venue)

Green = laptop allowed. Red = phone only, via Office Kit.

| Window | Light | Focus |
|---|---|---|
| 11:00–14:00 | GREEN | Download everything. Models, Termux, vendored weights. |
| 14:00–15:30 | RED | Camera → detection loop on the phone. Zones. |
| 15:30–16:30 | GREEN | **Load-bearing hour.** App ↔ local model, one round trip. |
| 16:30–19:00 | RED | Voice → rules. Spoken warnings. End-to-end path by 18:45. |
| **19:00** | — | **Evaluation Round 1 — must run on the phone.** |
| 19:00–00:00 | GREEN | Mesh + event log + persistence. |
| 00:00–01:00 | RED | LLM writes the shift report. |
| 01:00–06:30 | GREEN | Ask-the-log Q&A, polish, README, rehearse. |
| 06:30–09:00 | RED | **Freeze.** Submit on Reskilll. Rehearse until boring. |
| **09:00** | — | **Evaluation Round 2.** Top 10 at 13:00, pitch 13:45, awards 16:15. |

If the local model server is not answering by **16:30**, abandon Termux and switch to
WebLLM immediately. Do not fight it into the evening.

## Demo script — 3 minutes, no laptop on the table

1. Phone propped at the "site". **Aeroplane mode on, visibly.**
2. Speak a rule. JSON appears. Zone draws itself.
3. Walk toward the zone — it warns *before* the crossing.
4. Cross anyway. Breach logged.
5. Second phone: supervisor console, same events, live.
6. One tap: shift report, on-device, faces blurred.
   *"Nine warnings, three breaches, 67% prevented."*

Close: no cloud, no server, no subscription. This is the phone.

(Not "no credits spent" — credits are free this weekend, so that line claims a saving
nobody is paying for. The claim that lands is operational: a site with no network and
no budget can run this.)

## Logistics

- Submit **the repo AND demo assets** on Reskilll before the hard cutoff — repos lock
  before Top 10 pitches, late entries risk a scoring penalty or disqualification.
  **Only Surendra (team leader) can submit.** *Ask an organiser what counts as demo
  assets — video? slides? — today, not at 06:30.*
- **Every entry must run and pitch on the phone.** Not a preference, a rule.
- HackTracker records **counts and durations only** — no keystrokes, screenshots or
  browsing. Office Kit scoring is purely whether you genuinely worked through it and
  for how long. Nothing to game; just use it during every RED window.
- Confirm the real timings at the venue: the published rules say check-in ~08:00 Sat
  through awards ~17:00 Sun, which does not match the schedule table below.
- Do not film or share another team's screen or build.
- Query desk stays open through close. Series contact: sameera@reskilll.com.
- Make the repo **public** and check it while signed out. The last one 404'd on
  everyone because it was private.
- **Do not tamper with HackTracker.** Crash and tamper logs are read and penalised.
  A genuine lockout is an organiser's problem — go and tell them.
- Phones are iQOO property. Return them before exit.
- Attribute every open-source component in the README (TensorFlow.js, COCO-SSD, Qwen,
  llama.cpp — all permissively licensed).

## Reference

- Full plan / run sheet: https://claude.ai/code/artifact/1d9ae06f-2df8-480e-bcc9-096114a6924c
- Plain-language explainer: https://claude.ai/code/artifact/74820284-4d66-48f3-89ee-421fe5a4dbcd
- Old prototype (reference only, do not copy): `~/Desktop/IQOO`
