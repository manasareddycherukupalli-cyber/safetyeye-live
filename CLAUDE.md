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
| 20% | Novelty | Predicting a breach before it happens, not documenting it after |
| 15% | Creative phone use | HackTracker telemetry — multi-phone mesh, mic, speaker, torch |
| 15% | Technical depth | Vision + tracker + prediction, all local, backend included |
| 10% | Office Kit | Telemetry from the phone↔laptop bridge — use it deliberately |
| 10% | Demo | Rehearsed, on-device, no laptop on the table |

The organisers' own tip: *"Build apps that run locally and on-device, including the
backend."* **PWA is explicitly a welcome stack**, so a locally served app is a
first-class entry, not a workaround. The vision model (COCO-SSD) runs on-device and is
open source, which is the "local model at the core" the rules ask for.

**Never add a cloud API call** — but not for the reason first written here. The rules
say *"AI credits for the weekend are free"*, so cost is not the argument and we must
not claim it is. The argument is the product: the entire pitch is aeroplane mode, no
cloud, no server, no subscription. One remote call and the differentiator is gone.

**We run on the CPU/GPU, not the NPU.** The rules note that *"on-device inference
targets the Snapdragon NPU"*; TensorFlow.js uses the WebGL backend. Chasing the NPU
means the Qualcomm QNN stack and a model conversion — a day of work that can end with
nothing, traded against a stack that already works. The honest answer for a judge: no
vendor SDK, no conversion, runs on any Android device.

## Architecture — the load-bearing decision

The app is static files served over plain HTTP from the phone itself:

```
python3 -m http.server 8080 --directory app --bind 127.0.0.1
```

App loads from `http://127.0.0.1:8080/`. Serving on `localhost` is deliberate:

1. **Camera works** — `localhost` is a secure context, so `getUserMedia` is permitted
   with no tunnel and no certificate.
2. **No mixed content** — no HTTPS page reaching for plain-HTTP localhost.

**Not** MediaPipe — it needs a native Android build, which strands us during Red Light
hours.

## Stack

- **Vision:** COCO-SSD on TensorFlow.js, WebGL backend. Weights **vendored in
  `vendor/`** — nothing loads from a CDN, because the venue Wi-Fi will die.
- **Rules:** drawn by hand on the camera view and filled in through a form — type,
  limit, severity, and the sentence to speak. The `say` string is stored on the rule
  and played back at runtime, so nothing is generated in the reaction path.
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
app/mesh.js       relay client
app/log.js        IndexedDB events + frames
app/report.js     shift report + on-device blur
app/supervisor.html + supervisor.js   second phone's console
app/vendor/       tfjs + coco-ssd weights — LOCAL, never a CDN, and INSIDE app/
                  because the server's document root is app/
server/relay.py   mesh event relay
```

## Known holes — decide, do not discover

- **Rules are entered by hand.** Drawing a zone and filling in the form is the whole
  rule path. Say so plainly rather than implying anything is interpreted for us.
- **COCO-SSD detects people and generic objects, not hard hats.** PPE detection is the
  same pipeline with a fine-tuned model swapped in. Say this plainly; do not overclaim.
- **The camera cannot see in the dark.** No phone has IR, so below usable light
  COCO-SSD returns nothing — and "no detections" looks exactly like "nobody is there".
  A 32x24 luma sample once a second decides whether the picture is usable, with two
  thresholds so dusk does not make it flicker. Below the line the app says *too dark to
  monitor* rather than sitting there looking calm. Deployment answer for a judge: it
  needs the site's own lighting, which any site running a night shift already has.
- **Anonymisation blurs the whole frame**, not detected faces — masking only detections
  makes anonymity depend on the detector succeeding, and it misses constantly. Fails closed.
- **Termux must come from F-Droid or GitHub releases.** The Play Store build is
  deprecated and will waste an hour before admitting it.
- `termux-wake-lock` or Android kills the server mid-demo.
- **The screen sleeping stops detection.** rAF does not fire in a hidden page, so
  the display timeout silently ends monitoring. Held off with the Screen Wake Lock
  API while armed, re-acquired on `visibilitychange` (the browser drops it on every
  hide). The power button still wins — nothing in a browser can override it — so any
  gap is logged and shown rather than papered over. Plug the phone in: screen-on plus
  camera plus inference will not last a shift on battery.

## Schedule (from the printed playbook; timings may shift — confirm at venue)

Green = laptop allowed. Red = phone only, via Office Kit.

| Window | Light | Focus |
|---|---|---|
| 11:00–14:00 | GREEN | Download everything. Termux, vendored weights. |
| 14:00–15:30 | RED | Camera → detection loop on the phone. Zones. |
| 15:30–16:30 | GREEN | **Load-bearing hour.** App served on the phone, end to end. |
| 16:30–19:00 | RED | Zone form → rules. Spoken warnings. End-to-end path by 18:45. |
| **19:00** | — | **Evaluation Round 1 — must run on the phone.** |
| 19:00–00:00 | GREEN | Mesh + event log + persistence. |
| 00:00–01:00 | RED | Shift report on-device. |
| 01:00–06:30 | GREEN | Polish, README, rehearse. |
| 06:30–09:00 | RED | **Freeze.** Submit on Reskilll. Rehearse until boring. |
| **09:00** | — | **Evaluation Round 2.** Top 10 at 13:00, pitch 13:45, awards 16:15. |

## Demo script — 3 minutes, no laptop on the table

1. Phone propped at the "site". **Aeroplane mode on, visibly.**
2. Drag a zone on the camera, name it, set the warning line.
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
- Attribute every open-source component in the README (TensorFlow.js, COCO-SSD — both
  permissively licensed).

## Reference

- Full plan / run sheet: https://claude.ai/code/artifact/1d9ae06f-2df8-480e-bcc9-096114a6924c
- Plain-language explainer: https://claude.ai/code/artifact/74820284-4d66-48f3-89ee-421fe5a4dbcd
- Old prototype (reference only, do not copy): `~/Desktop/IQOO`
