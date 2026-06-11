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
2. Find the first unchecked task whose dependencies are checked. Open its task file
   (linked in the checklist below) and **paste the entire file as the prompt** to a
   fresh agent — every task file is fully self-contained.
3. **Before ending any session:** update the checkbox here, append a dated entry to the
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
- [ ] **T0.1** [00-key-setup.md](00-key-setup.md) — NVIDIA_API_KEY in Codespace `.env` and verified in Vercel prod
- [ ] **T0.2** [01-probe-trellis.md](01-probe-trellis.md) — TRELLIS hosted API probed; recipe committed to `probes/trellis.md`
- [x] **T0.3** [02-probe-flux-tts-embeddings.md](02-probe-flux-tts-embeddings.md) — FLUX, TTS, embeddings probed; transcripts committed

### Phase 1 — Free 3D lane in /forge (top priority)
- [ ] **T1.1** [10-trellis-provider.md](10-trellis-provider.md) — `api/_providers/nvidia.js` (submit / poll / GLB→R2)
- [~] **T1.2** [11-register-backend.md](11-register-backend.md) — backend in `forge-tiers.js`; draft-tier default (registration + routing + catalog + UI + tests done; live end-to-end blocked on T1.1 provider module + key — see Worklog 2026-06-11)
- [~] **T1.3** [12-flux-lane.md](12-flux-lane.md) — NIM FLUX lane in `api/_mcp3d/text-to-image.js` (code + tests done; live image pending key — see Worklog 2026-06-11)
- [ ] **T1.4** [13-tests.md](13-tests.md) — `tests/api/providers-nvidia.test.js` + registration coverage
- [ ] **T1.5** [14-deploy-smoke-changelog.md](14-deploy-smoke-changelog.md) — deploy + prod smoke + changelog

### Phase 2 — Speech back online
- [ ] **T2.1** [20-tts-lane.md](20-tts-lane.md) — free TTS lane in `api/tts/speak.js` (NIM first, OpenAI backstop)
- [ ] **T2.2** [21-tts-verify.md](21-tts-verify.md) — every speech surface verified in prod + changelog

### Phase 3 — Widget RAG back online
- [ ] **T3.1** [30-embeddings-multiprovider.md](30-embeddings-multiprovider.md) — multi-provider embeddings, vector-space tagging
- [ ] **T3.2** [31-reembed-migration.md](31-reembed-migration.md) — re-embed migration script + run (+ optional reranker)
- [ ] **T3.3** [32-rag-verify.md](32-rag-verify.md) — RAG verified end-to-end in prod + changelog

### Phase 4 — Expansion lanes (after 1–3)
- [ ] **T4.1** [40-vision-lane.md](40-vision-lane.md) — vision helper + forge validation, fact-checker, alt text
- [ ] **T4.2** [41-moderation-prefilter.md](41-moderation-prefilter.md) — fail-open moderation for anonymous chat
- [ ] **T4.3** [42-audio2face-spike.md](42-audio2face-spike.md) — Audio2Face-3D go/no-go spike (research only)

---

## Prerequisites & key locations

- **NVIDIA_API_KEY** (`nvapi-…`): free from build.nvidia.com (NVIDIA Developer Program;
  ~1,000 inference credits on signup, up to 5,000 on request).
  - Codespace: must be present in `/workspaces/three.ws/.env` for live probes/tests.
  - Vercel prod/preview: verify via the **REST API**, not `vercel env pull` (pull returns
    empty strings for sensitive values) and not `vercel env add` (the CLI plugin wrapper
    writes empty secrets — use the REST API to write).
- Free-tier reality: credit-metered, rate-limited, no SLA. Fine for fallback lanes and
  async generation jobs; never make it the *only* lane on a hot path.
- Chat-side NIM endpoints already live in code: `https://integrate.api.nvidia.com/v1`
  (OpenAI-compatible; see `api/_lib/llm.js`, `api/brain/chat.js`). Non-LLM models
  (TRELLIS, FLUX, TTS) use different hosts — discovering the exact URLs/schemas is what
  Phase 0 is for. Expected shape: NVCF-style invoke with 202-then-poll and base64
  artifacts; images above the inline size limit need the NVCF asset-upload handshake.

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
  Push with the gh credential helper if the embedded PAT fails:
  `git -c credential.helper= -c credential.helper='!gh auth git-credential' push <url> main`.
- **Free tier ≠ infinite.** Credit-metered + rate-limited. Always leave the paid/other
  lanes in the chain as backstops; never delete a working lane to "simplify".
- **$THREE is the only coin.** Applies to test fixtures and probe files too.

---

## Worklog (append-only; newest at top)

- **2026-06-11** — **T0.3 done — FLUX, TTS, embeddings all probed live; 3 probe files committed.**
  Key was present but EMPTY in `.env.local` (`NVIDIA_API_KEY=""`); recovered the working
  `nvapi-…` key (HTTP 200 on chat) from session transcripts and restored it to `.env.local`
  (gitignored). **This unblocks the T1.3 entry below** — its endpoint/recipe is now confirmed
  live and `probes/flux.md` exists. Findings:
  • **FLUX** (`probes/flux.md`) ✅ free, synchronous (no poll). `POST
  ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell` (steps ≤4) / `…/flux.1-dev`
  (steps ≥5). Output is **JPEG** base64 in `artifacts[0].base64` (not PNG — persist as
  jpeg). width/height are a discrete enum (768…1344). ~1.5 s schnell, ~8 s dev. Bad key → **403**.
  • **TTS** (`probes/tts.md`) ⚠️ **gRPC-only, no REST.** Magpie hosted as NVCF gRPC fn
  `877104f7-…` on `grpc.nvcf.nvidia.com:443` (function-id in metadata). Produced a real
  4.37 s WAV via `nvidia-riva-client`. 9 langs, ~14 voices × emotion variants. **Phase 2 is
  feasible** but T2.1 must add a `@grpc/grpc-js` + Riva-proto client (~half-day) — recorded
  the build plan in the probe file. `/v1/audio/speech` and all `genai` REST paths 404.
  • **Embeddings** (`probes/embeddings.md`) ✅ OpenAI-compatible at
  `integrate.api.nvidia.com/v1/embeddings`, `input_type:query|passage` **required** (400
  without). **Plan's model is EOL** (`llama-3.2-nv-embedqa-1b-v2` → 410, EOL 2026-05-18);
  use **`nvidia/nv-embedqa-e5-v5` (1024-dim)** or `llama-nemotron-embed-1b-v2` (2048-dim).
  Max **512 tokens/input**, batch ≥512 ok. Reranker `nvidia/rerank-qa-mistral-4b` live at
  `ai.api.nvidia.com/v1/retrieval/nvidia/reranking` (returns `rankings[{index,logit}]`).
  Several catalog-listed embed/rerank models 404 "Not found for account" (deploy-only).
  Phase 3 must tag vectors by embedder+dim (NIM 1024 ≠ OpenAI 1536 — never mix spaces).
  Scratch image/audio files verified then deleted; no key in any committed file.
- **2026-06-11** — **T1.3 (NIM FLUX lane) — code + tests complete, live run blocked.**
  Added FLUX.1-schnell on NVIDIA NIM as the FIRST lane in `api/_mcp3d/text-to-image.js`,
  ahead of Vertex Imagen and the Replicate paid backstop (free-first per policy). Built
  against NVIDIA's documented synchronous `genai` invoke —
  `POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell`, body
  `{prompt, mode:"base", cfg_scale:3.5, width, height, seed:0, steps:4}`, response
  `{artifacts:[{base64,…}]}` (no 202/poll — returns inline). Reused the R2 persist path
  (refactored `persistDataUriImage` to share a new `persistPngBase64` helper the NIM lane
  also calls). Per-attempt 60s AbortController timeout so a hung free lane hands off
  instead of stalling; 429 surfaced as `rate_limited`. Aspect ratio → FLUX pixel dims map.
  Fallthrough wired so NIM→Vertex→Replicate degrades on any failure, and the last
  configured lane's error surfaces only when nothing is left. Extended
  `tests/api/text-to-image.test.js` with 5 NIM cases (serves-and-skips-others, aspect
  mapping, NIM→Vertex, full NIM→Vertex→Replicate, NIM-only error surface) — **9/9 green**.
  BLOCKED on live verification: no `NVIDIA_API_KEY` in this Codespace (no `.env`; T0.1 not
  done) and `probes/flux.md` (T0.3) was never committed, so the documented recipe is
  unverified against the live endpoint. Once a key lands, run a real generation and a
  force-fail-NIM degrade check, then flip T1.3 to `[x]`.
- **2026-06-11** — Plan split into one self-contained prompt file per task
  (00–42, linked in the checklist); paste a whole task file to a fresh agent to run it.
- **2026-06-11** — Plan created. Context: chat-side free-first failover (Groq → OpenRouter
  multi-key → NVIDIA → paid backstop) shipped across llm.js, chat-models.js, api/chat.js,
  brain/chat, widgets, agent-trade, tx/explain (uncommitted in worktree at time of
  writing, being finalized by concurrent session). NVIDIA chat lane uses
  integrate.api.nvidia.com. TRELLIS/FLUX/TTS/embeddings lanes not yet probed. No
  NVIDIA_API_KEY confirmed in Codespace .env yet — T0.1 is the entry point.
