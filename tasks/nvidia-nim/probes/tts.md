# Probe: NVIDIA NIM — TTS (Magpie / Riva)

**Date:** 2026-06-11 · **Task:** T0.3 (Phase 0) · **Key:** `NVIDIA_API_KEY` (`nvapi-…`, redacted)

**Verdict:** ✅ **Invocable on the hosted free tier — but gRPC-only, NOT REST.** There is
**no** `/v1/audio/speech` or HTTP JSON endpoint for Magpie/Riva TTS (all 404). It's served
as an NVCF **gRPC** function over `grpc.nvcf.nvidia.com:443` with a `function-id` in the
call metadata. Produced a real 4.37 s WAV — works end to end. **Phase 2 (T2.1) is feasible**,
but the speak.js lane must speak gRPC, not fetch JSON. Effort + recipe below.

---

## What's hosted (NVCF function list for this account)

`GET https://api.nvcf.nvidia.com/v2/nvcf/functions` (Bearer key) → 164 functions. TTS/speech:

| function name                 | function-id                            | what |
|-------------------------------|----------------------------------------|------|
| `ai-magpie-tts-multilingual`  | `877104f7-e885-42b9-8de8-f6e4c6303969` | **TTS, 9 languages** — use this |
| `ai-magpie-tts-zeroshot`      | `55cf67bf-600f-4b04-8eac-12ed39537a08` | TTS voice-cloning (zero-shot, ref audio) |
| `ai-parakeet-ctc-riva`        | `22164014-a6cc-4a6f-b048-f3a303e745bb` | ASR / speech-to-text (bonus, not needed for T2.1) |
| `ai-riva-translate-1_6b` / `-4b` | … | NMT translation |

> `function-id` is required as gRPC **metadata** on every call; it selects the model.

## Why REST is out

All of these 404 (verified): `integrate.api.nvidia.com/v1/audio/speech`,
`ai.api.nvidia.com/v1/genai/nvidia/magpie-tts-multilingual`,
`…/v1/audio/nvidia/magpie-tts-multilingual`. Hitting the gRPC host over plain HTTP
(`https://grpc.nvcf.nvidia.com/v1/…`) returns the gRPC tell:
`reason:"no function-id was passed in the metadata"`. So: **gRPC with NVCF metadata is the
only transport.** There is no NVIDIA-hosted REST proxy for it.

## Working recipe (verified — produced real audio)

Transport: **Riva gRPC over TLS** to `grpc.nvcf.nvidia.com:443`, metadata
`function-id: <id>` + `authorization: Bearer <key>`. Easiest client = `nvidia-riva-client`
(Python) — used here to prove it; the production lane (Node/Vercel) uses `@grpc/grpc-js`
with the Riva protos (see "Effort for T2.1").

```python
# pip install nvidia-riva-client
import os, wave, riva.client
auth = riva.client.Auth(
    use_ssl=True, uri="grpc.nvcf.nvidia.com:443",
    metadata_args=[["function-id", "877104f7-e885-42b9-8de8-f6e4c6303969"],
                   ["authorization", "Bearer " + os.environ["NVIDIA_API_KEY"]]])
svc = riva.client.SpeechSynthesisService(auth)
resp = svc.synthesize(
    "Hello world. This is a NVIDIA Magpie text to speech probe.",
    voice_name="Magpie-Multilingual.EN-US.Sofia",   # see voices below
    language_code="en-US",
    sample_rate_hz=44100,
    encoding=riva.client.AudioEncoding.LINEAR_PCM)   # raw PCM little-endian s16
# resp.audio = raw PCM bytes; wrap in a WAV header (1ch, 16-bit) to play.
```

**Verified output:** `resp.audio` = 385,024 bytes → wrapped as mono/16-bit/44.1 kHz WAV =
**4.37 s, valid `RIFF WAVE PCM`** (`file(1)` + `wave` confirm). Other voices/langs also 200:
`Magpie-Multilingual.EN-US.Ray` (en-US), `Magpie-Multilingual.ES-US.Diego` (es-US), and the
bare `Magpie-Multilingual`. Scratch WAVs deleted.

## Request parameters

| param            | value |
|------------------|-------|
| `text`           | the utterance (also accepts SSML) |
| `voice_name`     | `Magpie-Multilingual.<LANG>.<Name>[.<Emotion>]` — see below |
| `language_code`  | one of the 9 below |
| `sample_rate_hz` | requested output rate; native model rate is **22050**, server resamples (44100 worked) |
| `encoding`       | `LINEAR_PCM` (raw s16; wrap in WAV) — Riva also supports `OGGOPUS`, `ALAW`, `MULAW` |

**Streaming:** `SpeechSynthesisService.synthesize_online(...)` yields audio chunks for
low-latency playback (Riva supports streaming TTS) — useful if avatar speech wants
first-byte-fast streaming instead of buffering the whole clip.

## Voices & languages (from the live model config)

- **Languages (9):** `en-US, es-US, fr-FR, de-DE, zh-CN, vi-VN, it-IT, hi-IN, ja-JP`.
- **Voice names** (combine as `Magpie-Multilingual.<LANG>.<Voice>[.<Emotion>]`):
  `Mia, Jason, Aria, Leo, Sofia, Ray, Pascal, Diego, Isabela, Louise, HouZhen, Siwei,
  Long, Phung`.
- **Emotion suffixes** (per-voice subset): `Neutral, Calm, Angry, Happy, Sad, Fearful,
  Disgust, PleasantSurprised`. e.g. `Magpie-Multilingual.EN-US.Aria.Happy`.
- Model is `magpie_tts`, `multilingual: True`, native `sample_rate: 22050`,
  `is_zero_shot: False` (the zeroshot/cloning model is the separate `ai-magpie-tts-zeroshot` fn).

## Rate limits / errors

No rate-limit headers surfaced over gRPC. Free tier is credit-metered → expect gRPC
`RESOURCE_EXHAUSTED` / `UNAVAILABLE` under load (map to `rate_limited`),
`UNAUTHENTICATED` for a bad key. Bad voice/lang → `INVALID_ARGUMENT`.

---

## Phase 2 (T2.1) decision — feasible, gRPC client required

`api/tts/speak.js` is a Vercel **Node** function currently hard-wired to OpenAI's REST
`/v1/audio/speech`. NIM TTS cannot reuse that fetch path. To make NIM the free first lane:

1. **Add a gRPC client.** Vendor the Riva TTS protos (`riva_tts.proto` + `riva_audio.proto`
   from `github.com/nvidia-riva/common`) and call with `@grpc/grpc-js` (pure-JS, works in
   Vercel serverless — no native addon). Channel: `grpc.nvcf.nvidia.com:443` with TLS
   credentials; attach per-call metadata `function-id` + `authorization: Bearer $NVIDIA_API_KEY`.
   *(Alternative: shell out is not viable on Vercel; `nvidia-riva-client` is Python-only.)*
2. **Map existing voices.** Callers pass OpenAI-style names (`nova`, `shimmer`, …). Map to
   nearest Magpie voice, e.g. `nova → Magpie-Multilingual.EN-US.Aria`,
   `shimmer → …EN-US.Sofia`, `onyx → …EN-US.Ray`, default `…EN-US.Sofia`.
3. **Output handling.** Magpie returns raw PCM → either wrap a WAV header server-side
   (simple) or request `OGGOPUS` for smaller payloads. Set `x-tts-voice`/`x-tts-model`
   headers to what actually served (`magpie-tts-multilingual`).
4. **Fallback.** NIM first, OpenAI REST as the paid backstop, per-attempt timeout, fail
   over before any audio bytes stream. Mirror into
   `packages/avatar-agent-mcp/src/tools/speak.js`.

**Effort: moderate (~half a day).** The only real work is the grpc-js + proto plumbing
(one small `api/_lib/nim-tts.js` helper); voice mapping and fallback are mechanical. No
blocker — hosted TTS is real and free, just gRPC. Record this decision in the Worklog
before building T2.1.

## Reproduction summary (key redacted)
- List functions: `GET https://api.nvcf.nvidia.com/v2/nvcf/functions` (Bearer key).
- Synthesize: Python snippet above, or grpc-js against the same host/metadata.
- Verified: 4.37 s mono 16-bit 44.1 kHz WAV from Magpie multilingual. Scratch deleted.

---

## T2.1 addenda (2026-06-11, live-verified while building the lane)

- **Subvoice ids are upper-cased.** `voice_name` must be
  `Magpie-Multilingual.EN-US.Aria` — a lowercase language tag
  (`…en-US.Aria`) fails with `INVALID_ARGUMENT: subvoice requested not found`.
  Full live subvoice map via `GetRivaSynthesisConfig` (same metadata): personas
  Mia/Jason/Aria/Leo/Sofia/Ray + Pascal/Diego/Louise/Isabela exist under EN-US;
  every language exposes a large persona cross-product.
- **OGGOPUS over NVCF is NOT an Ogg container.** The response is length-framed
  raw Opus packets (no `OggS` magic anywhere) — not directly playable. The
  production lane serves WAV for every non-pcm request instead.
- **Auth is per-connection, not per-call.** NVCF validates the bearer when the
  gRPC stream/connection is established (`failed to open stateful work request:
  PermissionDenied` on a fresh channel with a bad key) — but a warm channel
  that already authenticated keeps serving after the key in env changes.
  Key-failure tests need a fresh process.
- **Observed latency (Codespace → grpc.nvcf.nvidia.com):** ~370–430 ms for a
  short phrase, ~1.3–2.1 s for a full sentence (4.5 s audio), per-call.
