# 11 — Speech package: ASR + TTS as products (`/api/v1/ai/asr`, `/api/v1/ai/tts`)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

three.ws already runs NVIDIA NIM speech lanes (`api/_lib/asr-nvidia.js`,
`api/_lib/tts-nvidia.js`, routes `api/asr.js`, `api/tts/speak.js`, `api/tts/voices.js`) but
they exist as internal avatar plumbing. Productize them: versioned `/api/v1/ai/*` endpoints
with a free quota and x402 above it, listed on the bazaar with real descriptions. Nobody else
in the x402 ecosystem sells speech — this is a differentiated listing.

## Context

- Read the four files above end to end first: what the NIM lanes accept (audio formats, size
  caps, voices), which env vars gate them (NVIDIA key names), current error behavior.
- Versioned native routes → `api/v1/ai/asr.js` and `api/v1/ai/tts.js`, registered in
  `api/v1/_catalog.js` (read its entry contract). Match the handler style of existing v1
  routes (`wrap`/`json`/`error` from `api/_lib/http.js`).
- Paid lane: the platform's x402 rail (`paidEndpoint` from `api/_lib/x402-paid-endpoint.js`,
  `declareHttpDiscovery`/`THREEWS_SERVICE` from `api/_lib/x402/bazaar-helpers.js`,
  `priceFor` from `api/_lib/x402-prices.js`). Read `api/x402/tutor.js` as a compact example of
  a paid POST endpoint.
- The NIM lanes cost us real GPU quota — free tier must be tight: suggested
  ASR 5/day per IP (≤60s audio), TTS 10/day per IP (≤500 chars). x402 price above quota:
  ASR `'10000'` ($0.01) per clip, TTS `'5000'` ($0.005) per call (env-overridable via
  `priceFor` slugs `ai-asr` / `ai-tts`).

## Tasks

1. **TTS endpoint.** `POST /api/v1/ai/tts` `{ text, voice? }` → audio (respect however
   `api/tts/speak.js` returns audio today — content-type, encoding; reuse its lane code via a
   shared module, never duplicate). `GET /api/v1/ai/tts?voices=1` (or a `/voices` sibling —
   pick what fits the routing) lists voices free, reusing `api/tts/voices.js` internals.
2. **ASR endpoint.** `POST /api/v1/ai/asr` accepting what the existing lane accepts (read
   `api/asr.js` — likely base64 or multipart audio) → `{ text, confidence?, duration? }`.
3. **Free quota + x402.** Per-IP daily quotas as above (reuse `api/_lib/rate-limit.js` or the
   platform's daily-quota mechanism — find what exists, e.g. in `api/_lib/usage.js`). Above
   quota: the x402 402 challenge with bazaar discovery declared, so both endpoints appear on
   x402scan with REAL descriptions whose first sentence answers "what can I only get here":
   e.g. "Speech-to-text for agents over x402 — the only ASR lane in the x402 ecosystem; pay
   $0.01 USDC per clip, no API key, no account."
4. **Env gating.** Missing NVIDIA env → 503 `not_configured` naming the exact env var (never a
   500, never a fake response). Add both lanes to whatever health surface exists
   (`api/healthz.js` or `api/_lib/forge-lane-health.js` pattern — read and match).
5. **Tests** in `tests/api/v1-ai-speech.test.js`: routing + validation (bad body 400, oversize
   413/400 with clear message), quota fall-through to 402, missing-env 503, catalog entries
   present. Mock nothing of OUR code — fixture the NIM boundary with captured real response
   shapes. Targeted vitest until green. Also run `npm run audit:x402-catalog`.
6. **Docs:** `docs/api-reference.md` section for `/api/v1/ai/*` (runnable curls). Changelog
   entry (`feature`): speech-to-text and text-to-speech for agents, free daily quota, USDC
   above it.
7. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Both speech endpoints live with free quota → x402 fall-through, bazaar-discoverable with
uniqueness-first descriptions, env-gated honestly, tests + audit green, docs + changelog
updated, committed, pushed.
