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

A single process, `llama-server` (from [llama.cpp](https://github.com/ggml-org/llama.cpp)),
both serves the app and answers the on-device model's API calls:

```
llama-server -m qwen.gguf --path ./app --host 127.0.0.1 --port 8080
```

The app and the model share one origin (`http://127.0.0.1:8080`), which avoids CORS,
avoids mixed-content issues, and keeps the camera on a secure context — all without a
tunnel or certificate.

- **Vision** — TensorFlow.js + COCO-SSD spot people and objects in the camera feed; a
  simple IoU tracker follows each one across frames and projects its position ~0.75s
  ahead, so a warning can fire before a crossing rather than after.
- **Rules** — a danger zone is drawn (by hand, or from a spoken/typed instruction),
  with a type (`zone_intrusion`, `occupancy`, `obstruction`, `proximity`), a severity,
  and a spoken warning line.
- **Voice → rule** — a plain-language instruction is turned into a structured rule by
  the on-device model, using constrained decoding against a fixed JSON schema so
  malformed output is unrepresentable rather than merely unlikely. Because generation
  runs at roughly 15 tokens/sec on a 3B model, the model is never called inside the
  live detection loop — the warning sentence is written once, when the rule is
  created, and simply played back from storage when triggered.
- **Storage** — zones, rules, and events persist in IndexedDB across reload.
- **Report** — one tap summarizes the shift (warnings, breaches, percent prevented).
  Any stored breach snapshot has its entire frame blurred before saving.

## Stack and attribution

| Component | Role | License |
|---|---|---|
| [TensorFlow.js](https://www.tensorflow.org/js) | Runs the vision model in-browser | Apache-2.0, Google |
| [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) | Object detection model | Apache-2.0, Google |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) / `llama-server` | Serves the app and runs the on-device LLM | MIT |
| [Qwen2.5-Instruct](https://github.com/QwenLM/Qwen2.5) (3B, 1.5B fallback) | On-device language model — rule compilation, reports, log Q&A | See the model card on Hugging Face for exact terms |

All model weights and library files are vendored into the repo (`vendor/`) and loaded
from disk — nothing is fetched from a CDN at runtime, since the venue network can't be
relied on.

## Known limitations (disclosed, not hidden)

- **Speech recognition sends audio to Google.** The browser's built-in speech-to-text
  is not on-device, so it's a convenience layer over a typed-input fallback, which is
  fully offline. Speech **output** (the spoken warning) uses the browser's local
  text-to-speech and stays on-device.
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

1. Download a Qwen2.5-Instruct GGUF model (3B recommended, 1.5B as a fallback) into
   the repo.
2. Start the server from the repo root: `llama-server -m <model>.gguf --path ./app
   --host 127.0.0.1 --port 8080`
3. Open `http://127.0.0.1:8080/` on the same device — the camera requires a secure
   context, which `localhost` satisfies without a certificate.
