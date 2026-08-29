# Phone setup — Termux + llama.cpp + Qwen on the iQOO 15

Manasa's runbook. Follow top to bottom. Target: `llama-server` answering `curl` on
`127.0.0.1:8080` **before 16:30**. If it isn't, stop and switch to WebLLM.

---

## 0. Install Termux (5 min)

**Do NOT use the Play Store version.** It is deprecated and will fail.

Open Chrome on the phone → https://github.com/termux/termux-app/releases
Download the newest **`termux-app_v*+apt-android-7-github-debug_arm64-v8a.apk`**
(the iQOO 15 is arm64). Allow "install unknown apps" when prompted. Open Termux.

---

## 1. Base packages (5 min)

```bash
pkg update -y && pkg upgrade -y
pkg install -y git cmake make clang wget curl python binutils
termux-setup-storage
termux-wake-lock
```

`termux-setup-storage` pops an Android permission dialog — tap Allow.
`termux-wake-lock` stops Android killing the server mid-demo. **Run it every time
you restart Termux.**

---

## 2. Start the model download FIRST (runs ~20–40 min in background)

Downloads are the long pole and the venue Wi-Fi only gets worse. Start this before
you build anything.

```bash
mkdir -p ~/models && cd ~/models

# primary — ~1.9 GB
wget -c https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf

# fallback — ~1.1 GB, use if 3B is too slow in the demo
wget -c https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
```

`-c` means resume — if the Wi-Fi drops, re-run the same command, it picks up.

**Leave this session running.** Open a second session to keep working:
swipe in from the **left edge** of the screen → **NEW SESSION**.

---

## 3. Build llama.cpp (15–40 min, in the second session)

```bash
cd ~
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build -DGGML_OPENMP=OFF
cmake --build build --config Release -j $(nproc)
```

`-DGGML_OPENMP=OFF` avoids the most common Termux build failure. Compiling is slow
and the phone will get warm — that is normal.

When it finishes:

```bash
ls -lh ~/llama.cpp/build/bin/llama-server
```

You should see the file. If you do, the hard part is over.

---

## 4. Check the download finished

```bash
ls -lh ~/models
```

Expect roughly `1.9G` for the 3B and `1.1G` for the 1.5B. If a file is much smaller,
the download is incomplete — re-run the `wget -c` command.

---

## 5. First run — the moment of truth

```bash
mkdir -p ~/safetyeye/app
echo "<h1>SafetyEye</h1>" > ~/safetyeye/app/index.html

~/llama.cpp/build/bin/llama-server \
  -m ~/models/Qwen2.5-3B-Instruct-Q4_K_M.gguf \
  --path ~/safetyeye/app \
  --host 127.0.0.1 --port 8080 \
  -c 4096 -t 4
```

Wait for the log line that says the server is listening. **Leave it running.**

New session (swipe from left → NEW SESSION), then:

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Reply with one word: working"}]}'
```

A JSON blob with the model's reply = **done**. Tick the boxes in `NOW.md`.

Then open Chrome on the phone → `http://127.0.0.1:8080/` → you should see the
"SafetyEye" heading. That proves the app and the model share one origin, which is
what makes the camera work with no CORS and no certificate.

---

## If something breaks

| Symptom | Fix |
|---|---|
| Build dies with an openmp error | `pkg install -y libopenmp`, then rebuild |
| Build dies out of memory | drop the `-j $(nproc)` to `-j 2` |
| `wget` 404s | the HF filename changed — open the repo page in Chrome and copy the exact `.gguf` link |
| Server starts then dies when screen locks | you forgot `termux-wake-lock` |
| Model loads but replies take >5s | switch the `-m` path to the 1.5B file |
| Nothing works by **16:30** | stop. Switch to WebLLM. Do not keep fighting it. |

---

## Every time you restart Termux

```bash
termux-wake-lock
~/llama.cpp/build/bin/llama-server -m ~/models/Qwen2.5-3B-Instruct-Q4_K_M.gguf \
  --path ~/safetyeye/app --host 127.0.0.1 --port 8080 -c 4096 -t 4
```
