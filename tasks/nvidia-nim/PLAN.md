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
- [ ] **T0.3** [02-probe-flux-tts-embeddings.md](02-probe-flux-tts-embeddings.md) — FLUX, TTS, embeddings probed; transcripts committed

### Phase 1 — Free 3D lane in /forge (top priority)
- [ ] **T1.1** [10-trellis-provider.md](10-trellis-provider.md) — `api/_providers/nvidia.js` (submit / poll / GLB→R2)
- [ ] **T1.2** [11-register-backend.md](11-register-backend.md) — backend in `forge-tiers.js`; draft-tier default
- [ ] **T1.3** [12-flux-lane.md](12-flux-lane.md) — NIM FLUX lane in `api/_mcp3d/text-to-image.js`
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

- **2026-06-11** — Plan split into one self-contained prompt file per task
  (00–42, linked in the checklist); paste a whole task file to a fresh agent to run it.
- **2026-06-11** — Plan created. Context: chat-side free-first failover (Groq → OpenRouter
  multi-key → NVIDIA → paid backstop) shipped across llm.js, chat-models.js, api/chat.js,
  brain/chat, widgets, agent-trade, tx/explain (uncommitted in worktree at time of
  writing, being finalized by concurrent session). NVIDIA chat lane uses
  integrate.api.nvidia.com. TRELLIS/FLUX/TTS/embeddings lanes not yet probed. No
  NVIDIA_API_KEY confirmed in Codespace .env yet — T0.1 is the entry point.
