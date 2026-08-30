# SafetyEye

An offline workplace-safety monitor for small construction sites and factories that
can't afford a full CCTV-and-server install. Prop a phone facing a hazard — it watches,
warns people **before** they cross a line, and writes a compliance report at shift end.
Everything runs on the phone: no cloud, no server, no subscription.

Most camera safety systems are *forensic* — they document a breach after it happens.
SafetyEye is *preventive*: it tracks where someone is walking, predicts a crossing
about 0.75 seconds ahead, and speaks a warning first. A breach is only logged when the
warning failed, so the end-of-shift report leads with **incidents prevented**, not just
incidents.

Built by **Team Fight Club** — Surendra Avula (frontend) and Manasa Reddy (backend) —
for the iQOO Hackathon 2026, Bengaluru.

## How it works

The app is a self-contained PWA served over plain HTTP from the phone itself:

```
python3 -m http.server 8080 --directory app --bind 127.0.0.1
```

Serving on `127.0.0.1` keeps the page on a secure context, so `getUserMedia` is
permitted without a tunnel or a certificate.

- **Vision** — TensorFlow.js + COCO-SSD spot people and objects in the camera feed; a
  simple IoU tracker follows each one across frames and projects its position ~0.75s
  ahead, so a warning can fire before a crossing rather than after.
- **Rules** — a danger zone is drawn by hand on the camera view, then given a type
  (`zone_intrusion`, `occupancy`, `obstruction`, `proximity`), a severity, and the
  warning line to speak. The warning sentence is stored on the rule and played back
  from storage when triggered, so nothing is generated inside the detection loop.
- **Storage** — zones, rules, and events persist in IndexedDB across reload.
- **Report** — one tap summarizes the shift (warnings, breaches, percent prevented).
  Any stored breach snapshot has its entire frame blurred before saving.

## Stack and attribution

| Component | Role | License |
|---|---|---|
| [TensorFlow.js](https://www.tensorflow.org/js) | Runs the vision model in-browser | Apache-2.0, Google |
| [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) | Object detection model | Apache-2.0, Google |

All model weights and library files are vendored into the repo (`vendor/`) and loaded
from disk — nothing is fetched from a CDN at runtime, since the venue network can't be
relied on.

## Known limitations (disclosed, not hidden)

- **Rules are entered by hand, not spoken.** Zones are drawn on the camera view and
  filled in through a form. Speech **output** (the spoken warning) uses the browser's
  local text-to-speech and stays on-device.
- **Object detection is general-purpose, not PPE-specific.** COCO-SSD recognizes
  people and everyday objects, not hard hats or safety vests. The same pipeline would
  support a fine-tuned model for that; this build doesn't include one.
- **Anonymization blurs the entire frame**, not just detected faces. Blurring only a
  detected region would make privacy depend on the detector succeeding, which isn't
  reliable enough — this fails closed instead.

## Pre-existing components

An earlier SafetyEye prototype exists at a separate repository
(`manasareddycherukupalli-cyber/safetyeye`), with commits dated 25 August 2026 and
earlier. The **idea** carries forward from that prototype; the **code** in this
repository was written from scratch during the hackathon's event window
(29–30 August 2026). No code was copied from the earlier prototype.

## Running it

1. Serve `app/` from the repo root:
   `python3 -m http.server 8080 --directory app --bind 127.0.0.1`
2. Open `http://127.0.0.1:8080/` on the same device — the camera requires a secure
   context, which `localhost` satisfies without a certificate.
