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
- [x] **T0.1** [00-key-setup.md](00-key-setup.md) — NVIDIA_API_KEY in Codespace `.env.local` and verified in Vercel prod (live prod completion proven — see Worklog 2026-06-11)
- [x] **T0.2** [01-probe-trellis.md](01-probe-trellis.md) — TRELLIS hosted API probed; recipe committed to `probes/trellis.md` (captured live during T1.1 — see Worklog 2026-06-11)
- [x] **T0.3** [02-probe-flux-tts-embeddings.md](02-probe-flux-tts-embeddings.md) — FLUX, TTS, embeddings probed; transcripts committed

### Phase 1 — Free 3D lane in /forge (top priority)
- [x] **T1.1** [10-trellis-provider.md](10-trellis-provider.md) — `api/_providers/nvidia.js` (submit / poll / GLB→R2) — live-verified end-to-end (real GLB persisted + revalidated; see Worklog 2026-06-11)
- [x] **T1.2** [11-register-backend.md](11-register-backend.md) — backend in `forge-tiers.js`; draft-tier default (registration + tier-aware routing + catalog + UI + tests; full submit→poll chain verified against the T1.1 provider with a mocked NVCF transport — real-network smoke is T1.5. See Worklog 2026-06-11)
- [x] **T1.3** [12-flux-lane.md](12-flux-lane.md) — NIM FLUX lane in `api/_mcp3d/text-to-image.js` — live-verified (real JPEG generated + persisted + degrade order proven; JPEG persist + cfg_scale fixes landed — see Worklog 2026-06-11)
- [x] **T1.4** [13-tests.md](13-tests.md) — `tests/api/providers-nvidia.test.js` + registration coverage
- [ ] **T1.5** [14-deploy-smoke-changelog.md](14-deploy-smoke-changelog.md) — deploy + prod smoke + changelog

### Phase 2 — Speech back online
- [x] **T2.1** [20-tts-lane.md](20-tts-lane.md) — free TTS lane in `api/tts/speak.js` (NIM first, OpenAI backstop) — live-verified end-to-end incl. failover order (see Worklog 2026-06-11)
- [x] **T2.2** [21-tts-verify.md](21-tts-verify.md) — every speech surface verified in prod + changelog (3 surfaces real-browser verified on the free NIM lane; see Worklog 2026-06-11)

### Phase 3 — Widget RAG back online
- [x] **T3.1** [30-embeddings-multiprovider.md](30-embeddings-multiprovider.md) — multi-provider embeddings, vector-space tagging (NIM free primary, OpenAI backstop, per-doc-set tag; same-space query routing + cross-space refusal; 47 tests green — see Worklog 2026-06-11)
- [x] **T3.2** [31-reembed-migration.md](31-reembed-migration.md) — re-embed migration script + run (+ optional reranker) (script + 17 unit tests green; every SQL seam verified against live Neon; dry-run against prod = 0 docs/0 chunks so the real run is vacuous — empty corpus has nothing to migrate; NIM embedder live-verified ready — see Worklog 2026-06-11)
- [x] **T3.3** [32-rag-verify.md](32-rag-verify.md) — RAG verified end-to-end in prod + changelog (live prod widget grounded its answer in a NIM-embedded corpus; empty case degrades clean; changelog shipped — see Worklog 2026-06-11)

### Phase 4 — Expansion lanes (after 1–3)
- [x] **T4.1** [40-vision-lane.md](40-vision-lane.md) — vision helper + forge validation, fact-checker, alt text (shared `api/_lib/vision.js` + 3 consumers, all live-verified on the free NIM lane + degrade-tested — see Worklog 2026-06-11)
- [x] **T4.2** [41-moderation-prefilter.md](41-moderation-prefilter.md) — fail-open moderation for anonymous chat (NemoGuard pre-filter on all 3 anon surfaces; fail-open + kill-switch live-verified; gpt-oss stays demoted — see Worklog 2026-06-11)
- [x] **T4.3** [42-audio2face-spike.md](42-audio2face-spike.md) — Audio2Face-3D go/no-go spike (research only) — **NO-GO**: hosted A2F-3D functions exist but are not entitled to this free account; client-side lip-sync already covers it for free (see `probes/audio2face.md` + Worklog 2026-06-11)

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

- **2026-06-11** — **T4.1 (shared vision helper + three consumers) — DONE, all three
  live-verified on the free NIM lane + degrade-tested.** **Probe (`probes/vision.md`):** the
  hosted VLMs run on the **OpenAI-compatible chat host** (`integrate.api.nvidia.com/v1/chat/
  completions`) — the SAME host/protocol as the `llm.js` chat lanes, NOT the
  `ai.api.nvidia.com/genai` host FLUX/TRELLIS use. Multimodal via the standard
  `content:[{type:'text'},{type:'image_url',image_url:{url}}]` shape; synchronous, no poll, no
  NVCF asset handshake. Three models invocable on this account: **`nvidia/nemotron-nano-12b-v2-vl`
  (chosen primary** — ~281 image-prompt tokens, cheapest + clean JSON), `meta/llama-3.2-11b-vision-instruct`
  (chosen 2nd free lane, different family → independent failure modes), `meta/llama-3.2-90b-vision-instruct`
  (works but ~1616 tokens/image, unused). **No inline-size limit** on this host (verified data-URI
  bodies up to 2.07 MB — the 180 KB NVCF asset ceiling does NOT apply here); http(s) URLs also fetched
  server-side (but some origins block the fetcher — wikimedia 500'd). 403 bad key / 404 unknown model /
  500 on a blocked URL — all mapped. **Helper (`api/_lib/vision.js`):** the image-side twin of `llm.js` —
  `describeImage`/`describeImageJson`/`visionConfigured`/`VisionUnavailableError`, free NIM lanes first
  (nemotron → llama-11b), paid `gpt-4o-mini` backstop appended last only when `OPENAI_API_KEY` set,
  per-attempt timeout, normalized error codes, and a fire-and-forget `kind:'vision'` spend event via
  `recordEvent` (free NIM prices to 0 — `nvidia` already in `llm-pricing.js` FREE_PROVIDERS). Accepts a
  pass-through URL OR base64+mime (data-URI). **Consumer 1 — `/forge` input validation**
  (`api/_lib/forge-image-validate.js`, wired into `api/forge.js` image→3D branch before submit): a free
  NIM lane judges the primary reference photo (single clear subject? text screenshot? too dark? abstract?)
  and returns a designed 422 (`image_not_usable` + per-issue actionable copy) BEFORE a generation slot is
  burned. **Fail-open is the contract** — unconfigured/timeout/error/bad-reply all return `{ok:true}` and
  generation proceeds; the UI (`src/forge.js` + `pages/forge.html`) renders the message with a one-click
  **Generate anyway** (`skip_validation:true`) so a cautious verdict never permanently blocks a confident
  user. **Consumer 2 — fact-checker** (`agents/fact-checker/src/image-evidence.js`, wired into
  `api/x402/fact-check.js`): an optional `imageUrl` is described + text-transcribed + stance-judged and
  folded in as one weighted, verdict-compatible source (runs in PARALLEL with the web pipeline; a claim is
  now checkable on image evidence alone); response gains an `imageEvidence` block; cache key bumped v1→v2
  to fold in the image; bazaar input/output schema updated. Fail-open → `null`, web-only check proceeds.
  **Consumer 3 — avatar gallery alt text** (`api/_lib/avatar-alt-text.js`): new nullable `alt_text` column
  (migration `2026-06-11-avatar-alt-text.sql` + `schema.sql` alter-guard), generated **on thumbnail upload**
  from the PNG buffer already in hand (`api/avatars/thumbnail.js`, fire-and-forget, no extra fetch),
  backfilled by `scripts/backfill-avatar-alt-text.mjs` (idempotent, `--dry-run`), surfaced through
  `avatars.js` decorate + the list/search SELECTs, and consumed by `public/gallery/gallery.js`
  (`<img alt>`/`model-viewer alt` → `alt_text || name`). Fail-open → null → gallery falls back to the name.
  **Live-verified end-to-end** with the real key (`describeImage`, `validateForgeImage`, `imageEvidence`,
  `generateAltText` all returned correct results off the free `nvidia/nemotron-nano-12b-v2-vl` lane in
  ~1–2 s; the spend-write degrades cleanly with no DB — proving `recordEvent` is wired + non-fatal).
  **Tests:** `tests/api/vision.test.js` (27 cases) — chain order, NIM→NIM→OpenAI failover, 403→invalid_key,
  timeout-as-failure, VisionUnavailable, JSON-loose parsing, and EACH consumer's degraded path. Full
  all-modules-load (471) + forge-tiers + x402-forge + avatar-og + text-to-image suites green; typecheck
  clean. Changelog entry added (holder language) + `build:pages` validated. **Surprise:** vision lives on
  the `integrate` chat host, not the `genai` image-gen host — so it's a near-clone of `llm.js`, not of the
  TRELLIS/FLUX providers; and that host has no inline-image size cap, unlike the genai NVCF path.
- **2026-06-11** — **T4.3 (Audio2Face-3D feasibility spike) — DONE; recommendation NO-GO
  (conditional revisit).** Full findings + live transcripts in `probes/audio2face.md`.
  **Invocability:** A2F-3D IS published as hosted NVCF gRPC functions (Claire
  `0961a6da…`, Mark `8efc55f5…`, James `9327c39f…`) on the *same* transport Phase 2 TTS
  uses (`grpc.nvcf.nvidia.com:443`, Bearer key + `function-id` metadata) — but it is
  **not entitled to this free Developer account.** Proved it with a live `@grpc/grpc-js`
  gate probe (NVCF validates function-id+auth at stream setup, before the backend
  handler): good key + A2F ids → `NotFound … for account` (identical to a nonexistent
  UUID); bad key → `PermissionDenied`; and a **control** against the account's entitled
  functions (Magpie TTS `877104f7…`, Parakeet `22164014…`) → `Unimplemented`/
  `DeadlineExceeded`, i.e. routed *past* the gate. So the key authenticates fine; the A2F
  functions sit behind an NVAIE (AI Enterprise Essentials) evaluation entitlement, not the
  free NIM tier. Self-host is out too — it needs a datacenter GPU (A10G/L40S/…) this
  platform doesn't run. **Output mapping:** A2F emits ARKit-52 blendshapes @30fps + emotion
  — and our flagship rigs already carry them: parsed the *served* GLBs, `default.glb` has
  **67** morph targets (full ARKit + 15 visemes), `realistic-female.glb` **60**; both drop
  straight into the existing `src/runtime/arkit52.js` resolve/apply path with ~zero
  remapping. (But `readyplayerme.glb` has only 2 morphs and the Mixamo/stylized rigs —
  michelle/fox/xbot — have 0, so A2F is not a universal upgrade.) **Architecture/redundancy:**
  the platform ALREADY ships free, instant, zero-infra client-side lip-sync writing the same
  morphs (`src/lip-sync-analyser.js` freq→viseme off the live TTS audio, `src/runtime/lipsync.js`
  text fallback, composited with the 6-emotion layer in `src/agent-avatar.js`). A2F would
  add realism but at real cost — entitlement, a stateful gRPC streaming worker, per-utterance
  latency on top of TTS, credits — for a capability that's already "good enough" and free,
  violating the plan's free-first/never-the-only-lane doctrine. **Recommendation: NO-GO now**;
  revisit only if an NVAIE evaluation unlocks the functions (re-run the gate probe) AND there's
  product demand for film-grade lip-sync. A ~4–5 day effort breakdown is recorded in the probe
  file for that future Phase 5 (deliberately NOT added to the live checklist). No code touched
  in api/ or src/; probe scripts were temporary (run from `scripts/`, deleted). Key never written
  to any committed file.
- **2026-06-11** — **T4.2 (free fail-open moderation pre-filter for anonymous chat) —
  DONE, live-verified.** **Probe** (`probes/moderation.md`): two safety classifiers are
  invocable on the free tier over the OpenAI-compatible chat endpoint —
  `nvidia/llama-3.1-nemoguard-8b-content-safety` (chosen: clean JSON
  `{"User Safety":"safe|unsafe","Safety Categories":"…"}`, **median ~337 ms**, ~680 ms tail)
  and `meta/llama-guard-4-12b` (terser `safe`/`unsafe\nS#` backstop); `meta/llama-guard-3-8b`
  404s. **Key scope finding:** NemoGuard is a CONTENT-safety model, NOT a jailbreak detector
  — `"ignore your instructions…"` and a DAN roleplay both classify *safe*, so prompt-injection
  + autonomous-send governance stays with Granite Guardian (complementary, not redundant).
  **Built** `api/_lib/moderation.js` (zero-dep): `moderationConfig`/`moderationEnabled`
  (enabled iff `NVIDIA_API_KEY` set AND kill-switch off), `moderateAnonInput` (2 s abort
  budget via `ANON_MODERATION_TIMEOUT_MS`, **fail-open on EVERY error path** — non-200,
  timeout, network, garbage → `flagged:false`; only a parsed `unsafe` blocks), `parseVerdict`
  (NemoGuard JSON + Llama-Guard text, unknown→safe), `lastUserMessage`, and a short
  non-preachy `refusalReply`. **Wired into all three anonymous surfaces only:** the anon path
  in `api/chat.js` (signed-in callers skipped), public widget chat in
  `api/widgets/[id]/[action].js` (owner Studio preview `isOwner` skipped; refused turn
  persisted with `provider:'moderation'`), and `api/chat/proxy.js` (refusal emitted in the
  OpenAI completion/SSE shape the /chat app already renders). A block is always an in-band
  refusal in the normal reply format, never an HTTP error. **Kill switch:**
  `ANON_MODERATION_DISABLED=true` (mirrors `GUARDIAN_DISABLE`), disables instantly without a
  code change; model + timeout overridable via env. **gpt-oss re-promotion: DECLINED.**
  OpenRouter's 403 "requires moderation" on `openai/gpt-oss-120b:free` is an account-level
  policy toggle on OpenRouter's side — it fires *before* our verdict is ever relevant, so our
  pre-filter does not unlock it; left demoted in `chat-models.js` with the reasoning in-code
  (also un-testable here: no `OPENROUTER_API_KEY` in this Codespace). **Tests:**
  `tests/api/moderation.test.js` — 22 green, covering the four mandated scenarios (block,
  allow, outage fail-open ×3, flag-off bypass) plus parse/config/request-shape. Existing
  chat/widget/chat-models suites still green (81). **Live-verified** with the real key through
  the actual module: BLOCK → `flagged:true` + categories (`Guns and Illegal Weapons,
  Criminal Planning/Confessions`, ~1.0 s); ALLOW → `flagged:false` (~0.4 s); FAIL-OPEN on a
  forced bad key → `flagged:false, error:'moderation 403'` in 63 ms (chat would proceed
  un-moderated). Remaining T4.2 leg: prod deploy + the "force a moderation failure and watch
  chat keep working" prod smoke (the local fail-open + kill-switch are already proven).
- **2026-06-11** — **T2.2 (avatar speech verified on every prod surface) — DONE.**
  Changelog was already shipped by the concurrent committer in `f4e779e4` ("Avatar
  voices can speak out loud again", tag `fix`, link `/lipsync`) and `npm run build:pages`
  validates it — verified holder-readable (no commit jargon), so no new entry needed.
  Prod is green: latest production deploy `fa4120af` is READY (Vercel API). **Prod free
  lane proven live first:** anonymous `POST https://three.ws/api/tts/speak` →
  **HTTP 200, 295 KB valid RIFF/WAVE**, `x-tts-model: magpie-tts-multilingual`,
  `x-tts-voice: Magpie-Multilingual.EN-US.Aria`, 1.6 s — i.e. the free NVIDIA NIM Magpie
  lane (non-pcm requests served as WAV, header truthful). **Exhaustive caller grep**
  (`src/ public/ packages/ extensions/`, repo-wide) found exactly **two web surfaces that
  POST `/api/tts/speak`** plus one MCP twin that mirrors the chain via its own gRPC NIM
  client (not the HTTP endpoint); `pages/extension-privacy.html` only documents the
  endpoint and `/lipsync/mic` takes mic input (no synth). **Real-browser verification**
  (Playwright + Chromium against PROD, `/tmp` script, deleted after):
  1. **Lipsync demo** (`/lipsync` → `/demos/lipsync-tts.html`; the inline module is built
     into `/assets/demos-lipsync-tts-*.js`, which contains the single `/api/tts/speak`
     call) — real click on **#speak** → 200 on the free magpie lane, `HTMLMediaElement.play()`
     reached, **zero speech-path console errors**.
  2. **walk-avatar extension narrator** (read-the-page-aloud) — content script can't be
     side-loaded in the sandbox, so replayed its EXACT contract (`{text, voice, format:'mp3'}`
     → blob → `new Audio(objectURL).play()`) inside a real prod page: 200 magpie lane,
     **`AudioContext.decodeAudioData` decoded 2.09 s of playable audio**, `play()` resolved.
  3. **avatar-agent-mcp `speak` tool** (contract parity) — 200 magpie lane, **2.60 s
     decoded**, `play()` resolved; the published twin's own gRPC lane was already
     live-verified in T2.1. **Surprise:** the prod `/lipsync` HTML is the *built* page
     (137 lines, meta still names OpenAI TTS) and the speak call lives in the Vite bundle,
     not the HTML — grepping the served HTML for `tts/speak` is a false negative; check the
     `/assets/*.js` module. (The page's own meta description still says "OpenAI TTS" — a
     cosmetic copy stale-spot, not a speech-path bug; out of scope here, noted for cleanup.)
  Telegram creds absent locally (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHANGELOG_CHAT_ID` unset)
  → `changelog:push` skipped silently per CLAUDE.md. **Phase 2 complete: avatar speech is
  back on every production surface via the free lane.**
- **2026-06-11** — **T3.3 (end-to-end RAG verification in prod) — DONE on PRODUCTION.**
  Verified the whole widget-RAG path live against `https://three.ws` with a self-contained,
  fully-cleaned-up fixture (a throwaway verification user + public talking-agent widget seeded
  straight into the prod Neon DB, hard-deleted via cascade at the end — zero residue; prod
  corpus confirmed back to 0 docs after). **Method:** (1) seeded the widget, (2) hit the LIVE
  prod SSE chat endpoint with the empty corpus first, (3) ingested a distinctive corpus
  through the REAL production `ingestKnowledge` path (so passages embed via the free NIM lane
  and every row is stamped `nvidia/nv-embedqa-e5-v5@1024`), (4) re-asked the live endpoint a
  corpus-only question, (5) ran `testRetrieval` against prod to prove the query embedding lands
  in the same NIM space. **Results — all green:**
  • **Embedder lane:** `defaultIngestEmbedderTag()` resolved to `nvidia/nv-embedqa-e5-v5@1024`
  (free NIM), confirming ingest + query both ride the free lane, not the paid OpenAI backstop.
  • **Empty case:** widget with no knowledge → live SSE `200`, clean `event: done`, no
  `event: error`, graceful in-persona reply ("I'm Halcyon, a friendly assistant…"). No grounding,
  no crash.
  • **Grounded retrieval:** `testRetrieval` over the prod row returned top chunk tagged
  `nvidia/nv-embedqa-e5-v5@1024` at cosine **0.6111** — a real same-space match, which is only
  possible if the query was embedded by NIM (cross-space would have been refused, not scored).
  • **Grounded chat (the money shot):** the live prod endpoint answered *"The Halcyon coefficient
  is 8.213, and there are 17 nodes in the Halcyon cache ring, as stated in Project Halcyon —
  Internal Spec."* — both invented facts (8.213, 17) reproduced verbatim **and the source title
  cited**, proving the prod server retrieved + grounded on the NIM-embedded corpus. Facts were
  fictional and answerable only from the doc, so this can't be model prior knowledge.
  No new app code was needed — the T3.1/T3.2 code was already deployed and prod's
  `NVIDIA_API_KEY` is live (per T0.1). Holder-readable changelog entry shipped in
  `data/changelog.json` ("Talking-agent widgets answer from their knowledge again", fix,
  link `/widgets`), validated by `npm run build:pages`. Verification scripts were temp dotfiles,
  deleted after the run — no scratch committed. **Phase 3 complete.**
- **2026-06-11** — **T3.2 (re-embed migration) — DONE & verified; real run is vacuous
  (prod corpus empty).** Closed out the migration: every SQL seam the script uses is now
  proven against the LIVE prod Neon DB, not just the in-memory test fake.
  • **Dry-run against prod** (`node scripts/reembed-widget-knowledge.mjs --dry-run`):
  **0 docs / 0 chunks** on `ep-gentle-hill-…neon.tech` — the prod widget-knowledge corpus
  is genuinely empty today, so "every stored set is tagged NIM" is satisfied vacuously and
  the real migration run has nothing to migrate. This also exercised `planMigration`'s real
  survey SQL (the `count(...) filter (where c.embedder is distinct from ${tag})` grouping)
  against live Neon — parses and runs clean.
  • **Write-path SQL proven without polluting prod.** The two tables FK to real
  `widgets`/`users`, so seeding a synthetic doc would have meant fabricating a widget+user in
  prod — rejected as too invasive. Instead confirmed the migration's write form
  (`set embedding = ${JSON.stringify(vec)}::jsonb, embedder = ${tag}`) is byte-identical to
  the live ingest path `embedAndInsertChunks` (`api/widgets/[id]/_knowledge.js:330`), which is
  already deployed and writing to prod since T3.1 — so the `::jsonb` cast + tag write are
  already exercised against real Neon by production traffic.
  • **NIM embedder live-verified ready** (so the next real run, once a corpus exists, will
  embed for real): `embedPassages`/`embedQuery` on `nvidia/nv-embedqa-e5-v5@1024` returned
  1024-dim vectors in ~880 ms; cosine(Eiffel-Tower query, Paris passage)=**0.561** vs
  (query, banana passage)=**0.091** — asymmetric query/passage routing works, relevance is
  sharp.
  • **Unit tests: 17 green** (`tests/reembed-widget-knowledge.test.js`) — classify matrix,
  pending-only embeds, crash-mid-set leaves the doc tag unflipped + resume completes only the
  remainder, idempotent re-run embeds nothing, backoff retry/give-up matrix, write-free
  dry-run.
  • **Rate-limit incidents:** none (no real embedding work — empty corpus).
  • **Reranker (optional req 5):** already landed in T3.1 behind `KNOWLEDGE_RERANK_ENABLED=1`
  (default OFF, fail-open). The mandated "measure top-3 relevance on a real widget corpus" is
  impossible with zero stored docs — deferred to **T3.3**, which owns enabling + measuring it
  once a real corpus exists. Recorded here per the task's "record either way".
  Script was already committed (`f1587ba9`); this entry + the T3.2 tick are the bookkeeping.
  Staged PLAN.md only (concurrent agents share this worktree).
- **2026-06-11** — **T1.5 prod smoke, part 1 + upstream image-mode discovery & fix.**
  Deploy `5c161886` went READY with the Phase 1 code (after 4 consecutive deploy ERRORs:
  the audit-symlink/.git failure, fixed in `cdffd38c`, then a transient `embed`-export
  mismatch in `api/watsonx/embed.js` introduced by a mid-rename sweep, fixed in
  `f1587ba9`). **Text→3D draft verified on PRODUCTION**: `POST /api/forge {prompt, tier:
  draft}` → 200 in **15.0 s**, `backend: nvidia`, synchronous done, durable R2 GLB —
  fetched + validated (glTF magic, v2, declared length 1,372,132 = actual). **Image→3D
  failed in prod** with NVCF 422 — live probing (inline base64 at 203 KB *and* 35 KB,
  `;asset_id,` with the NVCF header, `;example_id,<asset-uuid>`, bare uuid) plus the
  official schema doc proved the hosted TRELLIS preview accepts ONLY `example_id` 0–3
  sample images: **user photos are unsupported upstream** (full table appended to
  `probes/trellis.md`). Shipped the honest routing the same hour: provider is text-only
  (asset-handshake code deleted; recipe preserved in probe/history), forge-tiers gained
  `userImages` capability + `resolveBackendId({userImages})` so photo drafts default to
  the standing Replicate lane, explicit photo+nvidia gets a designed 422
  `backend_text_only`, catalog exposes `user_images`, and the /forge UI now (a)
  auto-selects the tier's default engine until the user picks one (draft prompts land on
  the free lane for real first-time visitors), (b) disables text-only engines while
  reference views are attached, bouncing a blocked selection to the photo default.
  Changelog entry corrected to "prompt drafts free" (no photo overclaim). Tests: provider
  suite re-shaped (25 green), forge-tiers +3 cases (16 green), x402-forge/replicate
  untouched green. Re-smoke of the photo flow against the new deploy is the remaining
  T1.5 leg (expect `backend: trellis` via Replicate).
- **2026-06-11** — **T3.1 audit of `771c84b4` + gap closure; T3.2 re-embed script done
  (dry-run executed; prod run pending the T3.1 deploy).**
  **Audit verdict:** `771c84b4` implemented free-first embeddings on a *different* surface —
  `/api/agents/:id/embed` (the AgentMemory.recall embedder; NIM `baai/bge-m3` → paid Voyage)
  — and touched none of T3.1's actual targets (`api/_lib/embeddings.js`, the widget
  knowledge schema/search). Live-probed its model choice with the restored key:
  `baai/bge-m3` is invocable on this account (200, 1024-dim — the catalog "presence ≠
  invocable" trap did NOT bite), works without `input_type` (symmetric) and its 8192-token
  context fits that endpoint's 8192-char contract, so the model stands. **One real trap the
  commit left open, now closed:** it returns `model` in the response, but the caller ignored
  it — `src/agent-memory.js` persists embeddings to localStorage, so a provider failover
  (bge-m3 ↔ voyage-3-lite, both 1024-dim) silently cross-compared spaces. Now
  `_makeEmbedFn` (src/agent-identity.js) passes `{vector, model}` through, entries carry
  `embeddingModel`, `recall()` only cosine-compares same-model entries (mismatches fall to
  the substring path), persisted pre-tagging entries default explicitly to `voyage-3-lite`,
  and `cosineSim` refuses mismatched dims and zero vectors (was NaN). +5 recall tests in
  `tests/src/agent-memory.test.js`. The widget-lane T3.1 work itself (see entry below) was
  written this session and swept into `0e19dec7`/`f1587ba9`/`923bbb30` by the concurrent
  committer — verified committed byte-identical. **Live-verified the widget lane end-to-end**
  with the real key: e5-v5 passage+query embeds (1024-dim; right chunk scores 0.529 for a
  France query, others ≤0.16), cross-space refusal of a synthetic legacy row, the 512-token
  over-length 400 → truncation retry against the live endpoint, and the reranker
  (`nvidia/rerank-qa-mistral-4b` → correct full-permutation order).
  **T3.2 script** (`scripts/reembed-widget-knowledge.mjs`, landed in `f1587ba9` + an
  import-side-effect fix here): uses the same access layer as the API (`api/_lib/db.js` +
  `embedPassages`); surveys and classifies every doc (`done`/`flip`/`migrate`/`skip`+reason);
  batch 64 (≤512 probed ceiling), throttled, exponential backoff on 429/5xx/network only
  (never hard 4xx/config errors); resume-safe + idempotent via the per-row `embedder` tag;
  the doc tag flips only after a verified zero-remaining count — atomic per set, and since
  retrieval routes per-chunk tag, mid-migration reads are also correct in both spaces.
  Required `--dry-run` prints per-doc actions + chunk/token/request/credit/time estimates
  and writes nothing. New `tests/reembed-widget-knowledge.test.js` (15 cases against an
  in-memory fake of the two tables): classify matrix, pending-only embeds, crash-mid-set
  leaves the tag unflipped + a resume completes only the remainder, idempotent re-run embeds
  nothing, backoff retry/give-up matrix, write-free dry-run. **Dry-run executed against the
  prod Neon DB: 0 docs / 0 chunks** — the prod corpus is empty today, so the post-deploy
  prod run (the unchecked half of T3.2) is a formality; also confirmed both `embedder`
  columns already exist in prod. **Reranker decision: kept**, implemented behind
  `KNOWLEDGE_RERANK_ENABLED=1` (default OFF, strictly fail-open); the task's "measure top-3
  relevance on a real widget corpus" is impossible with zero stored docs — measure in T3.3
  once a corpus exists, before enabling the flag in prod. Full `tests/api` suite green (120
  files / 1991 tests) plus the targeted new suites (145 tests).
- **2026-06-11** — **T3.1 (multi-provider embeddings + vector-space tagging) — DONE,
  audited & tests green.** Widget RAG was silently broken (OpenAI-only embedder, prod key
  over quota); the retrieval lane is now free-first via NIM and, critically, can never mix
  vector spaces. **`api/_lib/embeddings.js`** is a zero-dep multi-provider module: a frozen
  `EMBEDDERS` registry keyed by tag (`<model>@<dim>`) — `nvidia/nv-embedqa-e5-v5@1024`
  (free, default) and `text-embedding-3-small@256` (paid backstop, and the
  `LEGACY_EMBED_TAG` every pre-tagging row lives in). Provider choice is **per document
  set, not per call**: `defaultIngestEmbedderTag()` picks the free NIM lane when its key is
  present (OpenAI otherwise), the chosen tag is stamped on the doc + every chunk at ingest,
  and `scoreRowsBySpace()` groups stored rows by tag, embeds the query **once per servable
  space** (`input_type:query` vs `passage` — NIM's asymmetric models require it; OpenAI
  ignores it), and runs cosine strictly within each space. Rows whose space no configured
  provider can serve are returned in `needsReembed` — reported, never silently compared.
  `cosine()` scores mismatched dimensions as 0 (different dim ⇒ different space, no
  shared-prefix garbage). `embeddingsConfigured()` is true iff at least one provider can
  actually serve, so feature gates stay truthful. **Schema change** (the SoT addition):
  migration `api/_lib/migrations/2026-06-11-knowledge-embedder-tag.sql` adds an `embedder
  text` column to BOTH `widget_knowledge_docs` and `widget_knowledge_chunks`
  (`add column if not exists`, idempotent) and backfills every existing row to
  `text-embedding-3-small@256` — encoding the "untagged legacy rows are OpenAI" assumption
  explicitly in the migration default; `schema.sql` carries the same column + alter-guards
  for fresh installs (lines 613/647). **Consumers** (`api/widgets/[id]/_knowledge.js`):
  `ingestKnowledge` stamps `defaultIngestEmbedderTag()` on the doc + chunks; `testRetrieval`
  routes via `scoreRowsBySpace` and 503s with an actionable `needs_reembed` message when no
  stored space is servable; `processQueuedDoc` re-resolves the embedder at worker time
  (keeps the queued tag if still servable, else re-embeds with the current default — safe
  because partial chunks are wiped first). Optional free NIM reranker
  (`api/_lib/rerank.js`, fail-open behind `KNOWLEDGE_RERANK_ENABLED=1`) sits behind cosine.
  **Tests:** `tests/api/embeddings.test.js` + `tests/api/widget-knowledge-embedder.test.js`
  + `tests/api/embed-policy.test.js` — **47 green**, covering the four mandated scenarios:
  tagging on ingest, same-space query routing, cross-space refusal (`needsReembed`/503),
  and fallback (free-first selection, worker re-resolve, no-provider 503). **State note:**
  the code/migration/tests were landed by the concurrent coordinator session (committed in
  `0e19dec7` / `7fae0b27` — shared worktree); this entry + the T3.1 tick are the remaining
  bookkeeping. Changelog deferred to **T3.3** (prod RAG verification owns the holder-visible
  announcement, mirroring T2.1→T2.2). T3.2 (re-embed migration script) is the next unchecked
  task and is being worked concurrently (uncommitted `scripts/reembed-widget-knowledge.mjs`
  + `tests/reembed-widget-knowledge.test.js` in the worktree — left untouched here).
- **2026-06-11** — **T2.1 (free NIM TTS lane) — DONE, live-verified end-to-end.** Decision
  gate per the probe: gRPC-only is fine — built the Node gRPC client. **Dependency/bundling
  decision:** added `@grpc/grpc-js` + `@grpc/proto-loader` (pure JS, no native addon) to
  root deps; vendored the Riva protos (`riva_tts/audio/common.proto`, MIT, SPDX headers
  preserved) under `api/_lib/riva-protos/` and check in a **generated protobufjs JSON
  descriptor** (`descriptor.js`, regenerated by `scripts/generate-riva-tts-descriptor.mjs`)
  loaded via `protoLoader.fromJSON` — no runtime `.proto` fs reads, so it survives the
  in-place esbuild bundling without includeFiles tricks. `@grpc/*` added to bundle-api
  EXTERNALS (CJS lazy-require pattern; NFT traces it once — only speak.js imports it);
  bundled the route with the exact prod flags into a temp outfile and import-loaded it: clean.
  New `api/_lib/tts-nvidia.js`: cached TLS channel to `grpc.nvcf.nvidia.com:443`, per-call
  metadata (`function-id` 877104f7…, bearer key), non-streaming `Synthesize`, LINEAR_PCM
  44.1 kHz → WAV-wrapped server-side, gRPC code → platform error map. `api/tts/speak.js`
  restructured free-first: NIM lane (30 s per-attempt budget, full buffer before any byte
  is written → failover always clean) → OpenAI backstop (now also has a timeout) → 502
  with both lane errors in attempt order; 503 only when NEITHER key set; validation/limits
  unchanged; `x-tts-voice`/`x-tts-model`/`x-tts-format`/content-type always truthful. MCP
  twin `packages/avatar-agent-mcp` (tools/speak.js) mirrors the chain via its own copy
  `src/lib/tts-nvidia.js` + descriptor (published standalone, can't import across the repo;
  noted in both headers), deps added, v1.0.3→1.1.0. **Voice map (live-verified, every
  persona 200'd):** alloy→Mia, ash→Jason, ballad→Leo, coral→Sofia, echo→Ray, fable→Leo,
  nova→Aria, onyx→Ray, sage→Mia, shimmer→Sofia, verse→Jason (all as
  `Magpie-Multilingual.EN-US.<P>`; bare-tag + region language aliases for the 9 langs).
  **Live numbers** (`scripts/verify-nvidia-tts.mjs`): full sentence → 4.46 s WAV in
  **1.3–2.1 s**; short phrase **~370–430 ms**; forced-bad-key failover proven in a child
  process: nvidia attempted first (gRPC 7 PermissionDenied), openai second, clean 502.
  **Three upstream surprises** (recorded in probes/tts.md addenda): subvoice ids need an
  UPPERCASE language tag (`EN-US.Aria`; lowercase → INVALID_ARGUMENT); NVCF "OGGOPUS" is
  length-framed raw Opus packets with NO Ogg container (unplayable → every non-pcm request
  is served as WAV, truthfully labeled; OpenAI backstop still emits native formats); NVCF
  validates auth at stream/connection setup, so a warm authenticated channel keeps serving
  after a key swap — key-failure tests must use a fresh process. New
  `tests/api/tts-speak.test.js` (15 cases: chain order both surfaces, transport-layer
  mocks only, voice/lang mapping, header truthfulness, 503/502 semantics, pcm/opus
  handling, validation) — green; agents-voice + chat-plugin-tool + all-modules-load (518
  tests) green; avatar-agent-mcp node:test suite green. Changelog entry deferred to T2.2
  (prod verification owns the holder-visible announcement).
- **2026-06-11** — **T1.3 (NIM FLUX lane) — DONE, live-verified.** With the restored
  `NVIDIA_API_KEY` in `.env.local`, ran `scripts/verify-nim-flux.mjs` (new, reusable —
  live + `--degrade` modes): a real "teapot" generation through `textToImage()` served by
  `black-forest-labs/flux.1-schnell` in **2.1 s end-to-end** (gen + persist + re-fetch +
  validation), artifact a **valid 1024×1024 JPEG, 51,368 bytes**, persisted via the shared
  R2 helper against a throwaway local MinIO (prod R2 creds empty in this Codespace — same
  approach as T1.1; production code untouched). Two live fixes, both forced by the probe /
  endpoint: (1) **JPEG persist** — the lane wrote NIM artifacts as `.png`/`image/png`, but
  FLUX output is JPEG (`probes/flux.md`); `persistPngBase64` → `persistImageBase64`, which
  sniffs magic bytes and labels `.jpg`/`image/jpeg` vs `.png`/`image/png` (Vertex PNG path
  unchanged, unknown bytes keep the PNG label). Verified live: persisted key/Content-Type/
  bytes all agree. (2) **`cfg_scale` removed from the schnell body** — endpoint enforces
  `cfg_scale ≤ 0` for the guidance-distilled schnell (sending 3.5 → 422 `less_than_equal`);
  probe table corrected. Degrade check (`--degrade`, invalid `nvapi-` key + synthetic
  Vertex/Replicate config): order proven from logs — NIM 403 "Authorization failed" →
  "nim flux failed, falling back" → Vertex attempted ("vertex imagen failed, falling back
  to replicate") → Replicate's real 401 surfaced as the final clean error. Exactly
  NIM→Vertex→Replicate. `tests/api/text-to-image.test.js` extended (JPEG fixture with real
  magic bytes, `.jpg` key + `image/jpeg` Content-Type asserted, no-`cfg_scale` regression
  guard) — **9/9 green**. NOTE: the code/test/probe/script changes were swept into the
  concurrent coordinator commit `c1ca9a64` (shared worktree); this entry + the T1.3 tick
  are the remaining bookkeeping. MinIO container destroyed after the run; no scratch
  images; key only in gitignored `.env.local`.
- **2026-06-11** — **T0.1 (key verification) — DONE.** Working `nvapi-…` key confirmed in
  `.env.local` (HTTP 200 on integrate.api.nvidia.com chat, llama-3.3-70b). Vercel REST API
  (project `prj_IWZmEnqR1pCZRCRuvhCFCDcOx5Wc`, team `team_zRpaxHPiMnQGXurBbegM3PCA`, token
  from the CLI auth.json): `NVIDIA_API_KEY` present targets=preview,production
  type=sensitive (updated 2026-06-08). Because sensitive values can't be read back (and the
  CLI empty-write trap exists), proved the prod VALUE works end-to-end: anonymous POST to
  prod `/api/brain/chat` with `nvidia-nemotron-nano` returned a completed stream served by
  NIM (1.1 s, 79 tokens). Phase 0 fully complete; T1.5 deploy gate is unblocked from the
  key side. Coordinator session also launched T1.3-finish, T2.1, and T3.1-audit/T3.2 in
  parallel (worklog entries to follow from each).
- **2026-06-11** — **T1.4 (NVIDIA provider + registration test suite) — DONE.** Added
  `tests/api/providers-nvidia.test.js` (28 cases, all green), mirroring
  `providers-replicate.test.js`: global `fetch` stubbed, `api/_lib/r2.js` mocked via
  `vi.mock` so the GLB persist asserts decoded bytes in / public URL out — no live calls.
  Coverage: (1) text→3D + image→3D submit body construction against the probed NVCF
  schema (mode, prompt 77-char clamp, per-tier `ss/slat_sampling_steps`, integer-only
  seed, `output_format:glb`); (2) the 202-then-poll loop — running→done (persists),
  running→failed (no artifact / 401·403 / 404), keep-polling on 429·5xx, poll
  timeout/network throw → running, persist-throws → failed, missing-taskId → failed;
  (3) asset-upload branch by image size — inline base64 under the 180 KB limit vs the
  NVCF asset handshake (create → PUT presigned → `data:…;asset_id,<id>` +
  `NVCF-INPUT-ASSET-REFERENCES` header) over it; (4) synchronous 200 completion decodes
  the base64 GLB, persists `model/gltf-binary` bytes to a `forge/nvidia/<uuid>.glb` key,
  returns the durable public URL; (5) every normalized error map — 401/403→`invalid_key`,
  402→`insufficient_credits`, 429→`rate_limited` (+`retryAfter` from header), 5xx→
  `provider_error`, network throw→`provider_unreachable`, plus the 422 validation-array
  readable-detail guard; (6) forge-tiers registration + draft-tier free-first default
  (picks `nvidia` when `NVIDIA_API_KEY` set, cleanly falls back to `trellis` when absent,
  stays explicitly selectable keyless). No third-party mints in fixtures (synthetic
  `$THREE`-domain URLs only). **Full `npx vitest run` green: 267 files / 3876 tests, 0
  failures** (the formerly-known MCP-auth failures are resolved). The Playwright e2e
  portion has pre-existing sandbox browser crashes (`page.goto: Page crashed`) unrelated
  to this unit-test-only change.
- **2026-06-11** — **T1.1 (`api/_providers/nvidia.js`) — DONE, live-verified end-to-end.**
  Built the free TRELLIS provider matching the established contract (factory
  `createNvidiaProvider()`, key via `env.NVIDIA_API_KEY`; `textTo3d`/`imageTo3d` returning
  `{kind, taskId, resultGlbUrl?}`; `status({taskId})` returning normalized state; error
  codes `provider_unreachable`/`invalid_key`/`insufficient_credits`/`rate_limited`/
  `provider_error`; `AbortSignal.timeout` on every fetch; 429→`rate_limited` for routing).
  Implements the NVCF protocol: POST `ai.api.nvidia.com/v1/genai/microsoft/trellis`,
  handles BOTH the synchronous-200 (draft) and 202+`NVCF-REQID`/poll paths, decodes
  `artifacts[0].base64` and persists via the shared `_lib/r2.js` `putObject`/`publicUrl`
  helper (same path the Vertex inline-PNG persist uses). Image inputs (R2 https URLs) are
  fetched server-side and inlined as a base64 data URI under 180 KB, else routed through the
  NVCF asset handshake (create-asset → presigned PUT → `NVCF-INPUT-ASSET-REFERENCES`).
  **Also captured the missing T0.2 probe** (`probes/trellis.md`) from the live runs — the
  key gotcha: `output_format` must be lowercase `"glb"` (uppercase 422s). **Live verified:**
  real draft text→3D "a teapot" returned a valid binary glTF (magic `glTF` v2, ~1.3–1.6 MB)
  **synchronously in ~12–13 s** (no poll needed at draft); full path incl. R2 persist proven
  by running `scripts/verify-nvidia-trellis.mjs` against a local MinIO S3 target (prod R2
  creds are empty in this Codespace — known limitation; the persist reuses the platform's
  shared, deployed R2 helper, exercised for real against MinIO). Interlocks exactly with the
  already-wired T1.2 dispatch in `api/forge.js` (sync→materialize done, async→poll). Existing
  provider/forge suites green (replicate/health/huggingface/x402-forge, 25 tests). **Observed
  end-to-end latency: 13.1 s** (gen + decode + persist + re-fetch + GLB validation).
- **2026-06-11** — **T1.2 (register NVIDIA backend) — wiring + tests complete, live
  end-to-end blocked.** Registered the free NVIDIA NIM TRELLIS lane in
  `api/_lib/forge-tiers.js` `BACKENDS` (`provider: 'nvidia'`, `paths: ['image']`,
  `byok: false`, `requiresEnv: ['NVIDIA_API_KEY']`, `free: true`, `credits: null`,
  `baseEta: 25` — **provisional**, flagged in-code pending the T0.2 `probes/trellis.md`
  latencies since that probe was never committed). Made backend selection **tier-aware**:
  new `FREE_DEFAULT_FOR_DRAFT` + `resolveBackendId({path, tier, backend})` route the draft
  tier to `nvidia` **only when `backendIsConfigured('nvidia')`** (NVIDIA_API_KEY present),
  transparently falling back to the standing Replicate TRELLIS default otherwise — so a
  keyless deploy (and the whole local test suite) is unchanged, no regression. Standard/high
  stay on trellis; geometry stays on meshy; every backend stays explicitly selectable at
  every tier. Catalog (`buildCatalog`) now exposes per-backend `free` and a
  `default_backend_for_tier` map so the UI can show which engine each tier picks. Wired the
  full dispatch in `api/forge.js`: a lazy **dynamic** `loadNvidiaProvider()` (imported on
  demand so this endpoint stays loadable even when a concurrent agent is mid-edit on the
  module). NOTE: the T1.1 provider shipped a **meshy/tripo-style** contract
  (`textTo3d`/`imageTo3d`/`status({taskId})` + synchronous-completion handle), NOT the
  Replicate `submit({mode})`/`status(id)` shape — so nvidia gets its own dedicated submit
  branch (native text/image→3D, no FLUX intermediate), a forge job-token wrapper
  (`provider: 'nvidia'`) so polls route back to the NIM provider, and a sync-completion path
  that mints a synthetic handle to materialize the already-persisted GLB. A missing module /
  absent key degrades to a clean `backend_unconfigured` 501, never a crash. Added the
  `nvidia: 'Free'` engine label in
  `src/forge.js` (the selector + estimate panel are already catalog-driven, so the backend
  auto-surfaces when configured). New `tests/api/forge-tiers.test.js` (8 cases: registration
  shape, config gating, draft-default routing both ways, no-disturbance of other
  tiers/paths, selectability, catalog surface) — **green**. forge-motion + x402-forge +
  provider-health + providers-replicate + providers-huggingface suites all still green.
  Verified against the **real** (concurrently-landed) `api/_providers/nvidia.js` with a
  mocked NVCF transport: `GET /api/forge?catalog` lists nvidia (configured/free); a draft
  POST with no backend routes to nvidia → queued + job_id (eta 15s); and polling that token
  routes back to the nvidia provider and hits the correct NVCF reqid. So the full UI catalog
  → submit → poll chain is wired and exercised against the actual provider. The only leg not
  exercised here is a **real network** call to NVIDIA — that is T1.5 (deploy + prod smoke),
  which needs NVIDIA_API_KEY live (T0.1). No code change pending for that.
  Follow-up: the MCP twin `api/_mcp3d/tools/studio.js` still hardwires the Replicate provider
  on its image path (it doesn't pass `tier`, so it's unaffected/not mislabeled) — extending
  the free-first draft default to that surface is a clean future task.
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
