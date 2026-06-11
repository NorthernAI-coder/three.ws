# NVIDIA NIM Integration — Master Plan

**Goal:** exploit the free NVIDIA NIM catalog (one `nvapi-` key, build.nvidia.com) far beyond
chat: a free TRELLIS lane for `/forge` 3D generation (the platform's #1 roadmap item — see
`docs/roadmap/generation-suite.md`), free FLUX text→image, free TTS to replace the dead
OpenAI speech path, free embeddings for widget RAG, and free vision/moderation lanes.

**Prime rule (from CLAUDE.md + the platform LLM policy):** free providers first, always;
paid keys only as last-resort backstops; nothing may hard-fail when one provider dies.
The chat-side free-first failover already shipped 2026-06-11 (`api/_lib/llm.js`,
`api/_lib/chat-models.js`) — this plan extends the same doctrine to 3D, speech, and retrieval.

---

## How to use this document (read this first, every session)

1. Read `CLAUDE.md`, then this file top to bottom.
2. Find the first unchecked task whose dependencies are checked. Work it using its
   **Prompt** verbatim (each prompt is self-contained — paste it to a fresh agent and it
   has everything it needs).
3. **Before ending any session:** update the checkbox, append a dated entry to the
   Worklog at the bottom (what was done, what was verified, what surprised you), and
   commit THIS FILE plus your changes — stage explicit paths only (concurrent agents
   share this worktree), and push to both remotes per CLAUDE.md.
4. Probe transcripts and API-schema findings are committed under `tasks/nvidia-nim/probes/`
   so hard-won endpoint knowledge survives any Codespace loss. Never store the API key
   in this folder — key locations are listed in Prereqs.

Status legend: `[ ]` not started · `[~]` in progress (note who/when in Worklog) · `[x]` done & verified · `[!]` blocked (say why in Worklog)

---

## Checklist (current state at a glance)

### Phase 0 — Key + live API probes
- [ ] **T0.1** NVIDIA_API_KEY available in Codespace `.env` and verified in Vercel prod
- [ ] **T0.2** TRELLIS hosted API probed; schema + transcript committed to `probes/trellis.md`
- [ ] **T0.3** FLUX, Magpie TTS, and embeddings endpoints probed; transcripts committed

### Phase 1 — Free 3D lane in /forge (top priority)
- [ ] **T1.1** `api/_providers/nvidia.js` — TRELLIS provider (submit / poll / GLB→R2)
- [ ] **T1.2** Backend registered in `api/_lib/forge-tiers.js` + catalog; draft-tier default decided
- [ ] **T1.3** NIM FLUX lane in `api/_mcp3d/text-to-image.js`
- [ ] **T1.4** Unit tests (mirror `tests/api/providers-replicate.test.js`)
- [ ] **T1.5** Deployed + prod smoke test (text→3D and image→3D return a loading GLB) + changelog entry

### Phase 2 — Speech back online
- [ ] **T2.1** Free TTS lane in `api/tts/speak.js` (NIM first, OpenAI backstop)
- [ ] **T2.2** Avatar speech surfaces verified in prod + changelog entry

### Phase 3 — Widget RAG back online
- [ ] **T3.1** `api/_lib/embeddings.js` multi-provider with vector-space tagging
- [ ] **T3.2** Re-embed migration for stored widget knowledge (+ optional reranker)
- [ ] **T3.3** Retrieval verified end-to-end in prod + changelog entry

### Phase 4 — Expansion lanes (after 1–3)
- [ ] **T4.1** Vision lane (forge input validation, fact-checker images, gallery alt text)
- [ ] **T4.2** NemoGuard/Llama Guard moderation pre-filter for anonymous chat
- [ ] **T4.3** Audio2Face-3D feasibility spike (research only — no integration commitment)

---

## Prerequisites & key locations

- **NVIDIA_API_KEY** (`nvapi-…`): free from build.nvidia.com (NVIDIA Developer Program;
  ~1,000 inference credits on signup, up to 5,000 on request).
  - Codespace: must be present in `/workspaces/three.ws/.env` for live probes/tests.
  - Vercel prod/preview: verify via the **REST API**, not `vercel env pull` (pull returns
    empty strings for sensitive values) and not `vercel env add` (the CLI plugin wrapper
    writes empty secrets — use the REST API to write, per `docs/` ops notes).
- Free-tier reality: credit-metered, rate-limited, no SLA. Fine for fallback lanes and
  async generation jobs; never make it the *only* lane on a hot path.
- Chat-side NIM endpoints already live in code: `https://integrate.api.nvidia.com/v1`
  (OpenAI-compatible; see `api/_lib/llm.js`, `api/brain/chat.js`). Non-LLM models
  (TRELLIS, FLUX, TTS) use different hosts — discovering the exact URLs/schemas is what
  Phase 0 is for. Expected shape: NVCF-style invoke with 202-then-poll and base64
  artifacts; images above the inline size limit need the NVCF asset-upload handshake.

---

## Phase 0 — Key + live API probes

### T0.1 — Key in place

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md and tasks/nvidia-nim/PLAN.md first): verify
> `NVIDIA_API_KEY` is usable. (1) Check `.env` for NVIDIA_API_KEY; if absent, STOP and ask
> the user to paste one (from build.nvidia.com) — do not proceed key-less. (2) Smoke-test
> it: POST https://integrate.api.nvidia.com/v1/chat/completions with model
> `meta/llama-3.3-70b-instruct`, a trivial message, max_tokens 10 — expect 200. (3) Verify
> the key exists in Vercel prod + preview via the Vercel REST API (NOT `vercel env pull`,
> which returns empty for secrets; NOT CLI `env add`, which writes empty values — if it
> must be written, use the REST API). (4) Record results in the PLAN.md Worklog, tick
> T0.1, commit the plan file (explicit path staging).

**Done when:** live 200 from the key in the Codespace AND confirmed present in Vercel prod.

### T0.2 — Probe TRELLIS

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md and tasks/nvidia-nim/PLAN.md first; requires
> T0.1): discover the exact hosted invocation protocol for Microsoft TRELLIS on NVIDIA
> NIM (https://build.nvidia.com/microsoft/trellis, https://docs.api.nvidia.com/nim/reference/microsoft-trellis).
> Using NVIDIA_API_KEY from .env, determine empirically: (1) invoke URL + auth headers;
> (2) text→3D request schema (prompt, seed, any quality params); (3) image→3D request
> schema — inline base64 limit, and the NVCF asset-upload handshake (create-asset →
> upload → reference asset id) for larger images; (4) response shape — base64 GLB
> artifact field, and the 202/poll protocol (poll URL, NVCF-POLL-SECONDS header, status
> codes); (5) observed latency per variant and any rate-limit headers. Run real probes
> with a tiny test image and a one-word prompt; decode one GLB to disk and confirm it
> parses (npx gltf-validator or three.js GLTFLoader in a node script — delete scratch
> files after). Write everything — exact curl/node transcripts (key redacted), schemas,
> limits, gotchas — to tasks/nvidia-nim/probes/trellis.md. Update PLAN.md Worklog, tick
> T0.2, commit both files.

**Done when:** `probes/trellis.md` contains a reproducible recipe: request → poll → valid GLB.

### T0.3 — Probe FLUX, TTS, embeddings

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md and tasks/nvidia-nim/PLAN.md first; requires
> T0.1): probe three more NIM endpoints with NVIDIA_API_KEY from .env and commit
> transcripts (key redacted) under tasks/nvidia-nim/probes/: (1) **FLUX text→image**
> (black-forest-labs flux.1-schnell and/or flux.1-dev on build.nvidia.com) — invoke URL,
> request schema (prompt/steps/size), base64 image output → probes/flux.md. (2) **TTS**
> (magpie-tts-multilingual; also check current Riva TTS NIM hosted offerings) — REST or
> gRPC? URL, voices, languages, audio formats, streaming or not; produce one real audio
> file and listen-check duration > 0 → probes/tts.md. (3) **Embeddings + reranker**
> (llama-3.2-nv-embedqa / nv-embedqa-e5-v5, and the rerankqa model) — these are
> OpenAI-compatible at integrate.api.nvidia.com/v1/embeddings but need the extra
> `input_type: query|passage` body field; record model ids, dimensions, max batch and
> token limits → probes/embeddings.md. For anything not actually invocable on the hosted
> free tier (some NIM models are deploy-only), say so explicitly in the probe file — that
> directly changes Phases 2–3 scope. Update PLAN.md Worklog, tick T0.3, commit.

**Done when:** all three probe files committed with working (or explicitly-impossible) recipes.

---

## Phase 1 — Free 3D lane in /forge

### T1.1 — TRELLIS provider module

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md, and
> tasks/nvidia-nim/probes/trellis.md first; requires T0.2): build
> `api/_providers/nvidia.js`, a TRELLIS generation provider matching the established
> provider contract — study `api/_providers/replicate.js` and `api/_providers/meshy.js`
> for the shape: a factory (platform-keyed, key from env via `api/_lib/env.js` — add an
> accessor if needed), submit functions for text→3D and image→3D returning a task id,
> a poll function returning normalized status, and the same normalized error codes
> (provider_unreachable / invalid_key / insufficient_credits / rate_limited /
> provider_error). Specifics: (1) implement the NVCF 202/poll protocol from the probe
> file; (2) image inputs arrive as R2 https URLs — fetch, and either inline base64
> (under the probed limit) or run the NVCF asset-upload handshake; (3) TRELLIS returns
> the GLB as base64 — decode and persist to R2 using the existing persist helper (find
> it via the Vertex inline-PNG persist added 2026-06-11 in api/_mcp3d/), and return a
> public URL like the other providers do; (4) timeouts on every fetch; free tier is
> rate-limited — surface 429s as rate_limited so callers can route. No mocks, no stubs,
> no TODOs. Syntax-check, run existing provider tests to ensure nothing broke. Update
> PLAN.md Worklog, tick T1.1, commit (explicit paths).

**Done when:** module exists, contract-complete, and a live Codespace script run
(text→3D, draft quality) produces a real R2-hosted GLB.

### T1.2 — Register the backend

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md; requires T1.1):
> register the NVIDIA backend in `api/_lib/forge-tiers.js` BACKENDS — provider `nvidia`,
> paths text-to-3d + image-to-3d, `byok: false`, `requiresEnv: ['NVIDIA_API_KEY']`,
> honest baseEta from the probe latencies, credits estimate, and free/zero vendor cost
> notes. Wire it through `resolveBackendId` / wherever the default backend per path+tier
> is chosen so that **NIM is the default for the draft tier** (free lane first, per
> platform policy) while Replicate/Meshy/Tripo stay selectable; check
> `api/_lib/regen-provider.js`, `api/forge.js`, and the catalog endpoint the /forge UI
> reads so the new backend appears with correct pricing/ETA in the UI. Trace the FULL
> path (UI catalog → submit → poll → gallery) and wire every connection. Run the forge
> test suites. Update PLAN.md Worklog, tick T1.2, commit.

**Done when:** /forge catalog (local dev) lists the NVIDIA backend, draft-tier submits
route to it, and existing backends are unaffected.

### T1.3 — FLUX text→image lane

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md, probes/flux.md;
> requires T0.3): add a NIM FLUX lane to `api/_mcp3d/text-to-image.js`. That module
> already has a Vertex-Imagen → Replicate-FLUX fallback structure (rebuilt 2026-06-11) —
> add NIM FLUX as the FIRST lane (free before paid, per platform policy), falling
> through to Vertex then Replicate on failure, reusing the existing R2 persist for the
> base64 PNG output. Keep per-attempt timeouts. Extend the existing
> tests/api/text-to-image.test.js coverage for the new ordering (NIM serves → others
> untouched; NIM fails → falls through). Update PLAN.md Worklog, tick T1.3, commit.

**Done when:** tests pass and a live local run generates an image via NIM with the
fallback chain intact.

### T1.4 — Tests

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md; requires T1.1–T1.3):
> write `tests/api/providers-nvidia.test.js` mirroring providers-replicate.test.js:
> mocked-fetch coverage of submit (text + image paths), the 202/poll loop, asset-upload
> branch selection by image size, base64-GLB persist call, and every normalized error
> mapping (401/402/429/5xx/network). Also cover the forge-tiers registration (backend
> resolvable, draft-tier default). Run the full forge + provider + llm test suites.
> Update PLAN.md Worklog, tick T1.4, commit.

**Done when:** new suite green; full `npm test` shows no NEW failures (6 pre-existing
MCP-auth failures on clean main are known — see memory/repo notes).

### T1.5 — Deploy + prod smoke + changelog

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md; requires T1.1–T1.4
> AND NVIDIA_API_KEY confirmed in Vercel prod from T0.1): ship the free 3D lane. (1) Add
> a holder-readable entry to data/changelog.json (free, faster default 3D drafts on
> /forge; tags: feature, improvement; link: /forge) and run `npm run build:pages` to
> validate. (2) Commit (explicit paths) and push to BOTH remotes per CLAUDE.md. (3) Watch
> the Vercel production build (~20 min; beware the `npx vercel build` api/-clobber trap —
> never run it locally and commit). (4) Prod smoke: submit text→3D draft on three.ws/forge
> → poll → GLB loads in viewer; submit image→3D with a real photo → GLB loads; confirm
> zero console errors and the network tab shows the nvidia backend. (5) Record results +
> latencies in PLAN.md Worklog, tick T1.5, commit the plan update.

**Done when:** a first-time visitor gets a draft GLB from a prompt AND from a photo on
production three.ws/forge via the free NIM lane.

---

## Phase 2 — Speech back online

### T2.1 — Free TTS lane

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md, probes/tts.md;
> requires T0.3): `api/tts/speak.js` is hard-wired to OPENAI_API_KEY (over quota in prod
> → speech is dead). Restructure it to the platform free-first pattern: NIM TTS
> (magpie/Riva per the probe — if the probe found hosted REST, use it; if gRPC-only,
> evaluate the effort honestly and record the decision in the Worklog before building)
> as the first lane, OpenAI as the paid backstop, per-attempt timeouts, fail over before
> any audio bytes are streamed. Map the existing voice names (`nova` etc.) to nearest
> NIM voices so existing callers keep working; keep response headers
> (x-tts-voice/x-tts-model) accurate about what actually served. Update the MCP twin in
> packages/avatar-agent-mcp/src/tools/speak.js with the same chain. Tests for the
> failover ordering. Update PLAN.md Worklog, tick T2.1, commit.

**Done when:** local run produces audible audio via NIM with OpenAI never called; chain
falls back correctly when NIM is forced to fail.

### T2.2 — Verify + changelog

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md; requires T2.1):
> deploy (changelog entry: "avatar speech is back" in holder language, tags: fix), push
> both remotes, then verify on prod: every surface that calls /api/tts/speak (find them:
> grep the frontends) actually plays audio. Record surfaces checked in the Worklog, tick
> T2.2, commit.

---

## Phase 3 — Widget RAG back online

### T3.1 — Multi-provider embeddings

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md, probes/embeddings.md;
> requires T0.3): `api/_lib/embeddings.js` is OpenAI-only (dead quota → widget knowledge
> retrieval silently broken). Rework it: NVIDIA NIM retrieval embeddings as the free
> primary (with `input_type: passage` for ingest and `query` for search), OpenAI as
> backstop. CRITICAL: embeddings from different providers are different vector spaces —
> never mix at query time. Tag every stored vector with its embedder (model id +
> dimension); find the storage schema (widget knowledge tables — see
> api/widgets/[id]/_knowledge.js and the ingest path) and add the column/backfill
> assumption that existing rows are OpenAI. At query time, embed the query with THE SAME
> provider the document set was embedded with; only use the free lane for sets ingested
> with it. Update `embeddingsConfigured()` semantics so feature gates stay truthful.
> Tests. Update PLAN.md Worklog, tick T3.1, commit.

**Done when:** new ingests embed free via NIM; existing OpenAI-embedded sets still query
correctly (against OpenAI if available) or are flagged for re-embed; nothing mixes spaces.

### T3.2 — Re-embed migration

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md; requires T3.1):
> write `scripts/reembed-widget-knowledge.mjs`: batch re-embed all stored widget
> knowledge chunks with the NIM embedder (respect free-tier rate limits — throttle,
> resume-safe by tracking embedder tag per row, idempotent re-runs), switching each
> document set's tag atomically so retrieval never sees a half-migrated set. Optionally
> add the NIM reranker as a post-retrieval quality stage in the widget knowledge search
> (measure: does it improve top-3 relevance on a real widget's corpus?). Dry-run mode
> required. Run against prod data only after T3.1 is deployed; record counts in the
> Worklog, tick T3.2, commit.

### T3.3 — Verify + changelog

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md; requires T3.2):
> end-to-end prod verification: a widget with ingested knowledge answers a question
> grounded in that knowledge (check the SSE reply quotes the corpus), with embeddings
> served by the free lane. Changelog entry (fix: widget knowledge answers again), push
> both remotes, tick T3.3, commit.

---

## Phase 4 — Expansion lanes (do not start before Phases 1–3 ship)

### T4.1 — Vision lane

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md): add a shared
> vision-completion helper to api/_lib/ (NIM vision models — nemotron nano VL or llama
> vision per what's hosted; probe first, commit probes/vision.md) following the llm.js
> free-first pattern, then wire three consumers: (1) /forge image→3D input validation
> (reject/warn on unusable photos before burning a generation); (2) fact-checker image
> evidence; (3) avatar gallery alt-text backfill. Each consumer degrades gracefully when
> vision is unavailable. Tests + changelog + Worklog + tick.

### T4.2 — Moderation pre-filter

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md): probe NemoGuard /
> Llama Guard hosted on NIM (probes/moderation.md), then add an optional pre-moderation
> pass for ANONYMOUS chat surfaces (api/chat.js anon path, widget chat, chat/proxy) —
> free, fast, fail-open (a moderation outage must never block chat; it's a filter, not a
> gate). Config-flagged so it can be disabled instantly. This also re-opens the
> moderation-gated gpt-oss free OpenRouter route if we pre-moderate ourselves — evaluate
> and note in chat-models.js if so. Tests + Worklog + tick.

### T4.3 — Audio2Face-3D spike

**Prompt:**
> In /workspaces/three.ws (read CLAUDE.md, tasks/nvidia-nim/PLAN.md): research-only
> spike, NO integration: determine whether NVIDIA Audio2Face-3D (blendshape lip-sync
> from audio) is invocable on the hosted free tier (it's gRPC/NVCF — github.com/NVIDIA/Audio2Face-3D),
> what its outputs map to on our avatar rigs (ARKit blendshapes? viseme set?), and what
> a real integration would cost in effort. Deliverable: tasks/nvidia-nim/probes/audio2face.md
> with a go/no-go recommendation and, if go, a task breakdown appended to this plan.
> Worklog + tick.

---

## Standing risks & traps (read before every task)

- **Concurrent agents share this worktree.** Stage explicit paths only; re-check
  `git status` and `git diff --staged` immediately before committing. Files can change
  between your read and your edit — re-read and retry, don't force.
- **`npx vercel build` clobbers `api/*.js` in place.** Never commit a large api/ diff
  without checking `head -1` for `__defProp`/`createRequire`. Recover:
  `git restore -- api/ public/`.
- **Vercel env via CLI is broken both directions** (pull → empty, add → writes empty).
  REST API only.
- **Push to BOTH remotes** (`threeD`, `threews`); never pull/fetch from `threeD`.
  The `threeD` mirror may 403 (gh account lacks write) — surface it, don't retry-loop.
- **Free tier ≠ infinite.** Credit-metered + rate-limited. Always leave the paid/other
  lanes in the chain as backstops; never delete a working lane to "simplify".
- **$THREE is the only coin.** Applies to test fixtures and probe files too.

---

## Worklog (append-only; newest at top)

- **2026-06-11** — Plan created. Context: chat-side free-first failover (Groq → OpenRouter
  multi-key → NVIDIA → paid backstop) shipped across llm.js, chat-models.js, api/chat.js,
  brain/chat, widgets, agent-trade, tx/explain (uncommitted in worktree at time of
  writing, being finalized by concurrent session). NVIDIA chat lane uses
  integrate.api.nvidia.com. TRELLIS/FLUX/TTS/embeddings lanes not yet probed. No
  NVIDIA_API_KEY confirmed in Codespace .env yet — T0.1 is the entry point.
