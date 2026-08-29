# Phone setup — Termux + llama.cpp + Qwen on the iQOO 15

Manasa's runbook. Status as of 29 Aug 12:22 IST: **Termux, llama-server and the 3B
model are all on the phone.** Steps 0–3 are done. Start at step 4.

---

## 0. Install Termux — DONE

From GitHub releases, arm64-v8a APK. Not the Play Store build.

## 1. Base packages — DONE

```bash
pkg update -y && pkg upgrade -y
pkg install -y git cmake make clang
pkg install -y wget curl python binutils
termux-setup-storage
termux-wake-lock
```

## 2. Models — 3B DONE, grab the 1.5B fallback when convenient

```bash
mkdir -p ~/models && cd ~/models
wget -c https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf
wget -c https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
```

Shorten the names so you stop typing them:

```bash
cd ~/models
mv Qwen2.5-3B-Instruct-Q4_K_M.gguf qwen3b.gguf
mv Qwen2.5-1.5B-Instruct-Q4_K_M.gguf qwen15b.gguf
```

## 3. llama-server — DONE, installed as a package

**Do not build llama.cpp from source on this phone.** clang 21 hits an internal
compiler error on `ggml-cpu/arch/arm/repack.cpp` (`ggml_gemm_q8_0_4x8_q8_0`).
Two attempts failed. The prebuilt Termux package works and took six seconds:

```bash
pkg install -y llama-cpp
llama-server --version
```

---

## 4. Run the server

```bash
mkdir -p ~/safetyeye/app
echo "<h1>SafetyEye</h1>" > ~/safetyeye/app/index.html
cd ~
llama-server -m models/qwen3b.gguf --path safetyeye/app --port 8080 -c 4096 -t 4
```

`llama-server` binds `127.0.0.1` by default, which is what we want — the app and the
model share an origin, so no CORS, no mixed content, and the camera is allowed.

Wait for the line saying the server is listening. **Leave this session running.**

## 5. Prove it answers

Swipe from the **left edge** → **NEW SESSION**, then:

```bash
curl -s localhost:8080/v1/chat/completions -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Reply with one word: working"}]}'
```

A JSON blob containing the model's reply means the whole architecture is proven.

Then open Chrome on the phone at **http://127.0.0.1:8080/** — you should see the
"SafetyEye" heading served by the same process that just answered the model call.

---

## Every time you restart Termux

```bash
termux-wake-lock
cd ~
llama-server -m models/qwen3b.gguf --path safetyeye/app --port 8080 -c 4096 -t 4
```

Without `termux-wake-lock`, Android kills the server when the screen locks.

## If something breaks

| Symptom | Fix |
|---|---|
| Server dies when the screen locks | you forgot `termux-wake-lock` |
| Replies take longer than ~5s | swap `-m models/qwen3b.gguf` for `models/qwen15b.gguf` |
| Port already in use | `pkill llama-server` then start again |
| `wget` 404s | filename changed on HF — open the repo page in Chrome, copy the exact link |
| Nothing works by **16:30** | stop. Switch to WebLLM. Do not keep digging. |
