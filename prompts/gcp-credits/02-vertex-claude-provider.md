# 02 — Vertex Claude provider: route all platform LLM traffic through GCP credits

## Mission

Add Google Vertex AI as a first-class Claude provider across every LLM path in this codebase,
behind env flags, with automatic fallthrough to the existing chain. When
`VERTEX_CLAUDE_PRIMARY=1` is set, the platform's *default* brain becomes real Claude on Vertex
(billed to our ~$100k GCP credits) instead of the current free-first Groq/OpenRouter/NIM
scavenging — a product-quality upgrade paid for by Google. When the flag is off, behavior is
byte-identical to today. No mocks, no partial wiring: streaming and non-streaming, every entry
point.

## Prerequisites (verify before starting; stop and report if missing)

- Prompt 01 ran: Vercel envs `GCP_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT`,
  `GOOGLE_CLOUD_LOCATION_CLAUDE` exist (`vercel env ls`), and `scripts/gcp/vertex-smoke.mjs`
  passes (Claude enabled in Model Garden).

## Context — the exact call surfaces (from prior code audit; re-verify line numbers)

All text inference is **raw `fetch`** (no Anthropic SDK in the hot path). Four surfaces:

1. **`api/_lib/llm.js`** — `llmComplete()`, the server-side one-shot completion helper used by
   ~35 call sites (agent `talk`/delegation — which the MCP `agent_hire` tools bottom out in —
   personas, x402 paid endpoints, crons, vision fallbacks). `anthropicProvider()` around line
   95 does a raw POST to `api.anthropic.com/v1/messages` with `x-api-key`. The chain is built
   in `providerChain()` (~lines 145–207), currently free-first: NIM/BYOK/Groq/OpenRouter first,
   paid Anthropic (`ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'`) and OpenAI as the tail.
2. **`api/llm/anthropic.js`** — the streaming SSE proxy behind **every embedded avatar/agent
   chat widget** (`POST /api/llm/anthropic?agent=<id>`). `MODELS` table (~lines 41–90) maps
   Anthropic model IDs → `envKey: 'ANTHROPIC_API_KEY'`; `UPSTREAM_URL.anthropic` ~line 93.
   Browser client (`src/runtime/providers.js` `AnthropicProvider`) only talks to this proxy —
   zero client changes needed.
3. **`api/chat.js`** — the main viewer/agent chat SSE endpoint with its own inline provider
   ladder mirroring the above (7 providers incl. watsonx). Highest-volume endpoint.
4. **`api/brain/chat.js`** — the `/brain` comparison page, the only SDK user
   (`@ai-sdk/anthropic` via Vercel AI SDK).

Reusable auth already in-repo: `api/_mcp3d/vertex-imagen.js` (~lines 55–217) implements
service-account JWT→OAuth token exchange via `crypto.subtle` with caching + metadata-server
fallback.

## Vertex wire format (differences from first-party Anthropic API)

- URL: `https://aiplatform.googleapis.com/v1/projects/{P}/locations/global/publishers/anthropic/models/{MODEL}:streamRawPredict`
  (non-streaming: `:rawPredict`; regional endpoints prefix the host with `{region}-`).
- Model ID goes **in the URL, not the body**. Body gains `"anthropic_version": "vertex-2023-10-16"`
  and drops `"model"`.
- Auth: `Authorization: Bearer <oauth token>` — no `x-api-key`, no `anthropic-version` header.
- Model ID mapping: bare IDs pass through (`claude-sonnet-4-6`); dated first-party IDs convert
  to `@` form (`claude-haiku-4-5-20251001` → `claude-haiku-4-5@20251001`). Write one shared
  mapping helper; do not scatter string surgery.
- SSE event shapes in the response are identical to first-party — existing parsers work.

## Tasks

1. **Extract shared GCP auth.** Pull the token-exchange logic out of
   `api/_mcp3d/vertex-imagen.js` into `api/_lib/gcp-auth.js` (`getGcpAccessToken()` with
   caching). Refactor `vertex-imagen.js` to use it. No behavior change to Imagen.
2. **`api/_lib/vertex-claude.js`** — a provider module exporting the model-ID mapper and
   `vertexAnthropicMessages(body, {stream})` returning the raw Response, using `gcp-auth.js`.
   Config from env: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION_CLAUDE` (default `global`).
3. **Flags** (document in `docs/gcp-credits.md`):
   - `VERTEX_CLAUDE_ENABLED=1` — Vertex becomes an available Anthropic transport.
   - `VERTEX_CLAUDE_PRIMARY=1` — chain inversion: Vertex Claude is tried **first** in
     `providerChain()` (with a sensible default model, e.g. Sonnet for chat-grade calls, Haiku
     for utility calls — follow each call site's existing model intent), before the free lanes.
   - Both off → zero code path change (prove it: diff behavior in a local run).
4. **Wire all four surfaces:**
   - `llm.js`: add `vertexAnthropicProvider()`; insert into `providerChain()` per the flags.
     On Vertex 429/5xx/quota errors, fall through to the rest of the chain exactly like any
     other failed provider.
   - `api/llm/anthropic.js`: when `VERTEX_CLAUDE_ENABLED=1`, route `provider: anthropic`
     models through Vertex streaming (`streamRawPredict`), passing SSE through unchanged;
     on failure fall back to first-party Anthropic if `ANTHROPIC_API_KEY` exists.
   - `api/chat.js`: add the Vertex lane to the inline ladder under the same flags, mirroring
     how the Anthropic lane sits today.
   - `api/brain/chat.js`: use `@ai-sdk/google-vertex`'s Anthropic support (or a custom fetch
     into the same provider module) so `/brain` can compare Vertex-served Claude too. If the
     AI-SDK route fights you, a thin custom provider over `vertex-claude.js` is acceptable —
     but it must actually work, not be stubbed.
   - `api/_lib/chat-models.js`: catalog entries so Vertex-served models are selectable and
     the routing brain knows about the transport (follow existing catalog conventions).
5. **Attribution/telemetry.** Whatever per-request logging exists for provider selection must
   record `vertex-anthropic` distinctly (so prompt 07's spend/usage reporting can attribute
   traffic). If provider health tracking exists (`api/_lib/provider-health.js`), register the
   new lane so circuit-breaking works.
6. **Tests + smoke.**
   - Unit-test the model-ID mapper and chain ordering under the four flag combinations
     (framework: whatever `npm test` already runs — match existing test conventions).
   - `scripts/gcp/vertex-llm-smoke.mjs`: hits a local `npm run dev` server on (a) `llmComplete`
     via an API route that uses it, (b) `/api/llm/anthropic` streaming, (c) `/api/chat`
     streaming — with flags on, asserting the response came from Vertex (via the telemetry
     marker or a debug header you add).
7. **Real-browser verification** (definition of done requires it): `npm run dev`, open an
   embedded agent widget page and the main chat, send messages with `VERTEX_CLAUDE_ENABLED=1
   VERTEX_CLAUDE_PRIMARY=1`, confirm streamed replies, no console errors, and Vertex attribution
   in server logs. Then flip flags off and confirm today's behavior is intact.
8. **Deploy config:** set both flags in Vercel **preview** env only. Production flip is the
   owner's call (it changes the billing lane) — leave production flags unset and say so in
   your report.

## Guardrails

- Fail-safe is non-negotiable: any Vertex error falls through to the existing chain. A GCP
  outage must never break chat.
- Don't touch the free-lane providers' logic or ordering relative to each other.
- No new npm dependency for auth (reuse `gcp-auth.js`); `@ai-sdk/google-vertex` for
  `/brain` only if it earns its keep.
- Never log token contents or SA material.

## Acceptance criteria

- [ ] `api/_lib/gcp-auth.js` extracted; `vertex-imagen.js` refactored onto it with no Imagen
      behavior change.
- [ ] `api/_lib/vertex-claude.js` exists: model-ID mapper + streaming/non-streaming message call.
- [ ] All four surfaces wired: `llm.js`, `api/llm/anthropic.js`, `api/chat.js`, `api/brain/chat.js`
      (+ `chat-models.js` catalog entries).
- [ ] Both flags off ⇒ byte-identical current behavior (proven in a local run, not assumed).
- [ ] Any Vertex error (429/5xx/quota) falls through to the existing chain — proven by forcing a
      failure locally and confirming the feature still responds.
- [ ] `vertex-anthropic` recorded distinctly in provider telemetry/health.
- [ ] Unit tests for the model-ID mapper and chain ordering under all four flag combinations.
- [ ] `scripts/gcp/vertex-llm-smoke.mjs` passes against `npm run dev` for `llmComplete`,
      `/api/llm/anthropic` streaming, and `/api/chat` streaming.
- [ ] Real-browser check done: embedded agent widget + main chat stream from Vertex with flags on,
      no console errors; flags off restores today's behavior.
- [ ] Flags set in Vercel **preview only**; production left unset.
- [ ] `npm test` green; `git diff` reviewed (no esbuild-mangled `api/*.js`).

## Wrap-up

Update `docs/gcp-credits.md` (flags, model mapping, rollback = unset flags). Changelog entry
per CLAUDE.md rules — the *code* is infra, but if you flip preview to Claude-primary that's
user-noticeable in previews only; use judgment. `npm test` green. Review `git diff` fully,
commit explicit paths, push `threews` (+ attempt `threeD`). Report token/latency observations
from the smoke runs and the exact env-flip needed to invert production.
