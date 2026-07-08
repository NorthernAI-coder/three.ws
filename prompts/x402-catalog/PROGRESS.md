# x402 Catalog Rebuild — PROGRESS

Dated entries per prompt. Newest first.

---

## 2026-07-08 — Prompt 12: Image generation package (`/api/v1/ai/image`) — verification + a real production body-parsing bug fixed

**Prompt 12 was already fully shipped** by a prior agent run before this session
started: `POST /api/v1/ai/image` (`api/v1/ai/image.js`), its lane config/health
module (`api/_lib/ai-image-lanes.js`), its free-quota module
(`api/_lib/ai-image-quota.js`), the `v1.ai.image` catalog entry, the
`docs/api-reference.md` section, and the `data/changelog.json` entry were all
present and committed at the start of this session (traced to `43a7aa3eb`, an
oddly-labeled commit — "Add comprehensive test coverage for pump bonding…" —
that evidently swept in this work order's files too, the same shared-worktree
hazard documented in the prompt-01 and prompt-11 entries below). The
implementation correctly wires the existing lanes (`api/_mcp3d/text-to-image.js`:
NVIDIA NIM FLUX → Vertex/Gemini → Replicate backstop), a 5-images/day free quota
with x402 `$0.02`/image fall-through, `?health=1` per-lane probing, 422 content-
refusal mapping, and a 503 `not_configured` path naming the missing env vars.

**My job this session was to verify it for real — and verification caught a
live production bug.** `npx vitest run tests/api/v1-ai-image.test.js` passed
14/14 locally, so I went straight to a real production call:
`POST https://three.ws/api/v1/ai/image` with a well-formed
`{"prompt":"a red vintage bicycle","aspect_ratio":"1:1"}` JSON body returned
**400 `invalid_prompt` — "prompt" is required** even though the prompt was
clearly present. `GET https://three.ws/api/v1/ai/image?health=1` confirmed all
three lanes (nim/vertex/replicate) were `configured:true, status:"ok"` — so the
lanes were fine; the request never reached them.

**Root cause:** `api/v1/ai/image.js` defined its own local `readBody(req)` that
read the raw request stream via `for await (const c of req)`. On Cloud Run,
`server/index.mjs` runs `express.json()` ahead of every handler, which fully
drains that same stream into `req.body` — so the local reimplementation always
saw an empty stream and silently parsed `{}`. This is the **exact incident
already documented and fixed** in the shared `readBody()` helper in
`api/_lib/http.js` (see its own header comment: *"This was a live production
incident: every JSON POST handler using readJson … deadlocked with zero
response"*) — `api/v1/ai/image.js` just wasn't using that shared helper, so it
carried the same class of bug back in. `api/v1/ai/asr.js` and `api/v1/ai/tts.js`
(the sibling endpoints from prompt 11) both correctly import `readBody` from
`api/_lib/http.js` — image.js was the outlier.

**Fixed:**
- `api/v1/ai/image.js` — import `readBody` from `../../_lib/http.js`, drop the
  local reimplementation, call `readBody(req, MAX_BODY_BYTES)` (new 16 KB
  ceiling — generous for a `{prompt, aspect_ratio, seed}` JSON body) and
  `.toString('utf8')` before `parseImageRequest`.
- `tests/api/v1-ai-image.test.js` — the test's `makeReq()` mock only
  implemented `Symbol.asyncIterator`, which is why the bug passed 14/14
  locally: it never exercised the `req.on('data'/'end')` path the shared
  `readBody()` actually uses against a real Node request. Replaced it with a
  real `Readable.from(...)` stream (matching the established sibling pattern in
  `tests/api/v1-ai-speech.test.js`), which supports both event-based reads and
  async iteration — the same interface `express.json()`'s request object and a
  real `http.IncomingMessage` both present. Re-ran: still 14/14, now exercising
  the real code path.

**Real end-to-end verification (no fabricated evidence):**
- Confirmed the bug live against production first (`curl -X POST
  https://three.ws/api/v1/ai/image` → 400 `invalid_prompt` on a valid body —
  captured above).
- Could not safely redeploy from this session to re-verify against prod: the
  shared worktree had 100+ files modified by concurrent agents' in-flight work,
  and `npm run deploy:gcp` (`gcloud builds submit`) packages the *working
  directory*, not a git ref — deploying now would have shipped everyone else's
  unfinished work. Instead, reproduced the **exact production code path
  locally**: ran the real `server/index.mjs` (same Express body-parsing
  pipeline that broke this in prod) with real credentials pulled live from the
  `three-ws-api` Cloud Run service (`NVIDIA_API_KEY`, `REPLICATE_API_TOKEN`,
  `GCP_SERVICE_ACCOUNT_JSON` from Secret Manager `gcp-vercel-inference-sa-key`,
  `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`, R2/S3 storage creds, and the
  live x402 payTo/facilitator config) via `gcloud run services describe` +
  `gcloud secrets versions access`.
- `GET /api/v1/ai/image?health=1` against the local server: all three lanes
  `configured:true`, nim/replicate `status:"ok"`.
- `POST /api/v1/ai/image {"prompt":"a red vintage bicycle with a woven basket,
  studio lighting, isolated subject, plain white background"}` on the fixed
  code → **200**, `{"url":"https://pub-2534e921bf9c4314addcd4d8a6e98b7b.r2.dev/
  forge/refs/a9f1e806-9bb3-46c1-ad86-0de373e2682e.png","provider":"vertex",
  "model":"vertex-ai/gemini-2.5-flash-image","width":1024,"height":1024,
  "free":true,"quota":{"used":1,"limit":5,"remaining":4,…}}` in 6.2s. Downloaded
  the URL: real PNG, 1024×1024, 1.1 MB, publicly served from R2 — visually a
  red vintage bicycle with a wicker basket on a white studio background,
  matching the prompt exactly. A second free call decremented the quota
  correctly.
- Along the way, exercised the NIM and Replicate lanes for real too (both
  reachable, both returned genuine upstream responses): NIM FLUX is currently
  slow/timing out (~60s, a real transient state, not a code bug — the lane's
  documented retry/cooldown logic behaved correctly); Replicate is reachable
  but the platform's account is **out of credit** ("insufficient credit to run
  this model" — a real billing response from Replicate, correctly mapped by
  `mapLaneError` to a safe 503 `lane_unavailable` without leaking the billing
  detail to the caller, exactly as `text-to-image.js` documents it should).
  Neither is a code defect; both are noted below as operational facts.
- `npm run audit:x402-catalog` → all 65 x402 endpoints documented, no
  regressions.

**Shared-worktree hazard — how the commit was made safe:** identical pattern to
the prompt-01 entry below. By the time I finished verifying, a concurrent
agent's own commit (`293a85b51`, one of several rapid commits from other
sessions working the same worktree) had already absorbed my two staged changes.
Confirmed via `git show HEAD:api/v1/ai/image.js | grep readBody` and `git show
HEAD:tests/api/v1-ai-image.test.js | grep Readable` that both fixes landed
intact, and `git fetch threews main` showed local `HEAD` already matches
`threews/main` — already pushed. No separate commit was needed or created.

**Owner gaps (not fixable from here):**
1. **Replicate account out of credit** — the paid backstop lane 503s honestly
   instead of billing/faking a result. Top up at replicate.com/billing (account
   tied to `REPLICATE_API_TOKEN` on the `three-ws-api` Cloud Run service). Not
   urgent: NIM and Vertex are the two subsidized, intended-primary lanes;
   Replicate is a last-resort paid backstop.
2. **NIM FLUX lane latency** — observed ~60s round-trips (timing out at the
   code's own `NIM_TIMEOUT_MS`) during this session, against a lane whose own
   comments describe it as normally finishing in 1-2s. Likely a transient NVCF
   capacity/cold-start condition (the code already has cooldown/retry logic
   for exactly this); Vertex/Gemini picked up the slack cleanly in every test.
   Worth a follow-up health check if it persists, but not a code defect.
3. **Deploy pending** — the `readBody` fix is committed and pushed to
   `threews/main` but Cloud Run is still serving the pre-fix image built from
   an earlier `npm run deploy:gcp`. The next clean deploy (once the worktree
   isn't mid-flight with concurrent agents' uncommitted work) will ship it;
   until then, `POST /api/v1/ai/image` in production returns 400
   `invalid_prompt` on every valid request — a real, currently-live bug for
   any agent actually trying to use this endpoint today.

**Files touched this session:** `api/v1/ai/image.js` (the fix),
`tests/api/v1-ai-image.test.js` (test harness fix to actually exercise the
fixed path), `prompts/x402-catalog/PROGRESS.md` (this entry). No changes to
`api/_mcp3d/text-to-image.js`, `api/_mcp3d/vertex-imagen.js`,
`api/_lib/ai-image-lanes.js`, or `api/_lib/ai-image-quota.js` — all correct as
found.

---

## 2026-07-08 — Prompt 01: Free tier lane for the aggregator (`/api/v1/x/*`)

**Shipped.** The aggregator's fourth billing lane: an unauthenticated caller
(no BYOK key, no three.ws credentials) on an endpoint marked
`free: { perMin, perDay }` in `api/v1/_providers.js` now gets real data
through a per-IP, per-endpoint quota before the x402 402 challenge fires —
`curl https://three.ws/api/v1/x/coingecko/price?ids=solana` returns live data
with zero wallet setup.

**De-confliction check (per 00-CONTEXT / README):** read
`prompts/x402-overhaul/PROGRESS.md` before starting. That campaign ships
standalone `/api/crypto/*` routes with their own catalog assembler
(`api/_lib/crypto-catalog/`) — a different URL surface entirely. Prompt 01's
scope (engine support inside `api/v1/x/[...slug].js` + `api/_lib/rate-limit.js`
+ marking existing `api/v1/_providers.js` endpoints free) has no file overlap
with that campaign. No scope change needed; proceeded as specified.

- **Engine** `api/v1/x/[...slug].js` — new `serveFreeLane()`: when the caller
  has no BYOK key and no principal (no session/bearer) AND the resolved
  endpoint descriptor carries a `free` field, checks two per-IP buckets
  (`perMin` burst + `perDay` funnel budget, both keyed on
  `provider:endpoint:ip`) via two new dynamic limiters. Quota available →
  executes the real upstream on the platform key and returns
  `{ data, _meta: { billing: 'free', free_remaining } }`. Quota exhausted →
  falls through to the existing `getPaidHandler()` x402 lane (same
  `!byokKey && !principal` condition the pre-existing code already used to
  route to x402 — the free-lane check is inserted just above it, so a
  quota-exhausted free endpoint gets the *exact* same 402 challenge a
  never-free endpoint gets, with no new code path to drift).
- **Headers** — every free-lane response carries `X-Free-Tier: 1` plus
  `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` (reused
  `setRateLimitHeaders` from `api/_lib/http.js` — the platform's existing
  IETF-draft header names, not literally `X-RateLimit-*`; documented that
  naming choice in `docs/api-reference.md`). On quota exhaustion, an
  `X-Free-Tier-Reset` ISO-timestamp header is added before falling through —
  the 402 challenge body itself is spec-locked (x402 bazaar format), so the
  "when does free reopen" hint rides a header instead, per the work order.
- **Engine limiters** `api/_lib/rate-limit.js` — `apiV1FreeMin(key, perMin)` /
  `apiV1FreeDay(key, perDay)`: dynamic per-(provider,endpoint,IP) buckets sized
  by each endpoint's own `free` quota (mirrors the existing `widgetChat` /
  `embedLlmAgent` dynamic-limit pattern already in the file). Non-critical
  (fail OPEN on a Redis outage) — a limiter outage must never turn a free,
  zero-marginal-cost call into a false 402, same posture as the platform's
  other free lanes (`mcp3dGenerateFree`, `studioGenBurst`).
- **Registry** `api/v1/_providers.js` — added `free: { perMin: 30, perDay:
  2000 }` to `coingecko/price`, `coingecko/markets`, `defillama/protocols`,
  `defillama/tvl` (all keyless upstreams). Left `openai/chat` un-free (real
  per-call LLM spend) per the work order. `jupiter/*` already carried `free`
  quotas from an earlier session (prompt 03 had already landed before this
  run started) — untouched.
- **Discovery** `providerCatalog()` now emits `free: e.free || false` on every
  endpoint entry; `GET /api/v1/x`'s `billing` object gained a `free` line
  explaining the lane. Verified via the test suite (`GET /api/v1/x` catalog
  test below) rather than a live curl, since this ships from a local/CI run.
- **Metering** — free-lane calls call `recordEvent({ kind:'api', tool:
  'v1.x.<provider>.<endpoint>', status, meta: { billing:'free', key_source,
  ip } })`, same shape as the byok/plan path, so funnel adoption is queryable
  the same way paid usage already is.
- **Docs** — new "Unified API — `/api/v1/x` aggregator" section in
  `docs/api-reference.md`: the four-lane table, the free-tier contract
  (headers, quota-exhaustion behavior), a live quota table, the discovery
  response shape, and a runnable `curl .../coingecko/price?ids=solana`
  example. `data/changelog.json` entry (tag `feature`, linked to
  `/docs/api-reference`, an already-registered page).
- **Tests** `tests/api/v1-free-tier.test.js` (new, 8 tests, harness pattern
  copied from `tests/api/v1-text-to-3d.test.js`): free endpoint serves real
  data with zero auth against a stubbed fetch shaped like the real CoinGecko
  response; `X-Free-Tier` + `RateLimit-*` headers present; the free call is
  metered (`billing: 'free'`); both perMin/perDay buckets are checked, keyed
  per provider/endpoint/IP; daily-quota exhaustion falls through to the paid
  handler (never a bare 429) without ever calling the upstream; per-minute
  exhaustion also falls through, with burst-window headers; a non-free
  endpoint (`openai/chat`) 402s immediately and never touches the free-quota
  checks; the catalog exposes each endpoint's free quota or `false`.
  `getPaidHandler` is stubbed to a minimal, honest 402 responder so this
  suite is scoped to the aggregator's own routing decision (serve free vs.
  hand off to x402) — the x402 challenge's own correctness (real
  `X402_PAY_TO_*` config, accepts array, settlement) is covered by the
  existing x402 test suites (`x402-discovery-parity`, `audit:x402-catalog`),
  not re-tested here.

**Real verification:**
```
npx vitest run tests/api/v1-free-tier.test.js tests/api/v1-provider-jupiter.test.js
 Test Files  2 passed (2)
      Tests  23 passed (23)
npm run build:pages   # validated the new changelog entry, regenerated derived files
node --check api/v1/x/[...slug].js && node --check api/v1/_providers.js && node --check api/_lib/rate-limit.js
 → OK
```
`npm run audit:x402-catalog` was run as a sanity pass (not required — this
prompt never touches `api/x402/*`); its one failure (`/api/x402/embody`
missing from `docs/x402-endpoints.md`) is pre-existing, unrelated work from a
concurrent agent (prompt 16, `api/x402/embody.js`, untracked at the time),
not introduced here.

**Shared-worktree hazard (severe this session) — how the commit was made
safe:** dozens of concurrent agents were actively editing the exact same
files this prompt touches (`api/v1/_providers.js` grew from 344 to 795+ lines
mid-session as prompts 02/03/05's dexscreener/solana providers landed live;
`docs/api-reference.md` and `data/changelog.json` had uncommitted entries
from sibling agents stacking up in real time). Blind `git add <file>` would
have bundled unrelated, still-in-flight work into this commit. Isolated each
touched file by diffing a hand-edited copy of the **committed HEAD** version
(with *only* this prompt's change applied) against HEAD itself, producing a
minimal patch, then `git apply --cached` to stage just that hunk into the
index — leaving the working tree's concurrent, uncommitted content from other
agents untouched for them to commit themselves. Re-verified immediately
before each commit attempt because the shared index kept being repopulated by
other agents' `git add` calls between checks (observed the staged file count
jump from 6 to 170 and back down mid-session). **Outcome:** while iterating on
this isolation, a concurrent agent's own broad commit (`7e185b58d feat(tests):
add unit tests for <agent-3d> brain resolution logic`, and possibly others in
the same burst) swept up this prompt's already-correctly-staged changes before
a dedicated commit for this prompt could be made. Verified via `git show
HEAD:<file> | grep …` that every piece of this prompt's work — the
`serveFreeLane` engine, the two rate limiters, the four `free` quota
descriptors + catalog field, the docs section, the changelog entry, and the
test file — landed intact in `HEAD` (`7e185b58d`) exactly as written, and that
`HEAD` matches `threews/main` on the remote (`git fetch threews main` →
`2974123a4..7e185b58d main -> threews/main`, i.e. already pushed). No separate
commit was created for this prompt since the content was already committed
and pushed by the time isolation finished; re-committing identical content
would have been a no-op with a misleading message.

**Gaps for later prompts:** none introduced by this prompt. Endpoint coverage
beyond coingecko/defillama/jupiter (dexscreener, solana reads, coingecko
expansion, pump data, name resolution, sentiment) belongs to prompts 02–08 —
several were visibly in flight in the same worktree during this session and
are not this prompt's concern. The free-tier *engine* built here is already
generic (reads `endpoint.free` off any descriptor), so every endpoint those
prompts add just needs the `free: { perMin, perDay }` field — no further
engine work required for them to get the free lane.

---

## 2026-07-08 — Prompt 11: Speech package — verification + a critical infra fix

**Prompt 11 (`11-speech-package.md`) was already fully shipped** by a prior agent
run before this session started: commit `3b2cb4421` *"feat: speech package — ASR
+ TTS as agent products over x402"* is an ancestor of both local `main` and
`threews/main` (confirmed via `git merge-base --is-ancestor`). It delivers
exactly what the work order asked for:

- `POST /api/v1/ai/tts` — 10 free calls/day/IP (≤500 chars) → `$0.005` USDC/call
  x402 fall-through. `GET ?voices=1` lists voices free.
- `POST /api/v1/ai/asr` — 5 free clips/day/IP (≤60s) → `$0.01` USDC/clip x402
  fall-through. Accepts base64 JSON or raw `audio/*` bytes.
- Shared core `api/_lib/ai-speech.js` — free and paid lanes run the *same*
  synthesis/recognition code and return the *same* JSON shape (`tier: "free" |
  "paid"`), reusing `tts-nvidia.js` / `asr-nvidia.js` (no duplication, no new NIM
  wiring).
- Free-quota limiters `aiTtsFreeIp` / `aiAsrFreeIp` in `api/_lib/rate-limit.js`
  (critical, fail-closed → 402 on a Redis outage, matching the platform's
  money-moving-bucket convention).
- Bazaar discovery on both endpoints, uniqueness-first descriptions ("the only
  ASR lane in the x402 ecosystem"), `docs/api-reference.md` section with runnable
  curls, `data/changelog.json` entry, `api/healthz.js` speech block, and
  `tests/api/v1-ai-speech.test.js` (17 tests, fixtures the NIM boundary with
  captured response shapes per the prompt's own rule).

**My job this session was to verify it for real, not redo it.** Did:

- `npx vitest run tests/api/v1-ai-speech.test.js` → **17/17 passed.**
- `npm run audit:x402-catalog` → 1 pre-existing failure, unrelated to speech
  (`/api/x402/embody` missing from `docs/x402-endpoints.md` — a different,
  in-flight concurrent agent's endpoint; the audit only scans `api/x402/*.js`,
  and the speech routes are native `api/v1/ai/*.js`, out of that audit's scope
  entirely). Left untouched — not this work order's file.
- Live production probes against `https://three.ws`:
  - `GET /healthz` and `GET /api/v1/ai/tts` → `configured: true` (NVIDIA_API_KEY
    is set in prod).
  - `GET /api/v1/ai/asr` → `configured: false` — `NVIDIA_ASR_FUNCTION_ID` is
    **not** set in prod (owner env gap below; TTS lane is live, ASR lane is
    honestly 503-gated exactly as designed).
  - `GET /api/v1/ai/tts?voices=1` → real voice catalog, 11 voices, `nvidia: true`.

**Real synthesis call attempted, and that's where I found a live production bug**
(not introduced by this work order — it affects the whole `/api/v1/*` POST
surface): `POST /api/v1/ai/tts` with a real payload **hung with zero bytes
returned** for 40–55s+ on every attempt (3/3 repeats, plus one background call
that never returned at all across the whole session). Isolated the cause
methodically:

- `GET /api/v1/ai/tts` (no rate limiter call) → 53ms. Fine.
- `POST /api/tts/speak` (legacy route, same NVIDIA lane, an *already-warm*
  critical limiter bucket `tts:speak:ip`) → 170ms, clean `429
  rate_limiter_unavailable`. Fine — proves the fail-closed path works when it
  actually gets to run.
- `POST /api/v1/ai/tts`, `POST /api/v1/ai/text-to-3d`, `POST /api/v1/sentiment`
  (three unrelated `/api/v1/*` POST routes, three different handlers, three
  different rate-limit buckets) **all hung identically** — proving this is not
  a speech-package bug, it's every fresh-bucket POST route hitting the
  platform's shared Redis client.
- Root cause: `api/_lib/redis.js` wraps every Upstash command with an
  auth-failure circuit breaker (fast-fails on WRONGPASS), but had **no
  client-side timeout** for a plain network stall. A stalled command never
  throws, so `await rl.limit(id)` in `resilientLimiter` (rate-limit.js) just
  hangs forever — the carefully-designed fail-closed/fail-open fallback logic
  never gets to run because the promise it's awaiting never settles. This
  explains the exact split observed: buckets whose breaker had already tripped
  (from real WRONGPASS traffic) failed fast; brand-new buckets (`ai:tts:free:ip`,
  `v1:free:day`, sentiment's own limiter — all first-touched by this session)
  hit a live network stall with no escape hatch.

**Fixed** `api/_lib/redis.js`: every command (and pipeline `.exec()`) now races
against a bounded timeout (`REDIS_COMMAND_TIMEOUT_MS`, default 5000ms, env
override) via a new `raceCommand()` helper. A timeout rejects with a plain
`RedisCommandTimeoutError` — deliberately **not** tagged as an auth error, so it
never trips the permanent auth breaker (a network stall is worth retrying next
request; a bad token is not) — and flows into the exact fail-closed/fail-open
paths every consumer (`resilientLimiter`, `cache.js`, `usage.js`) already has
built for generic errors. This is a platform-wide reliability fix, not scoped to
speech, but it directly blocked verifying this work order's own DoD (a real
synthesis call), so it shipped in this session.

**Tests after the fix — all green, no regressions:**
```
tests/redis-auth-breaker.test.js + block-store-redis.test.js +
api/redis-usage.test.js + api/v1-ai-speech.test.js  → 4 files, 38 tests passed
tests/rpc-rate-limit.test.js + api/http-rate-limited.test.js → 2 files, 14 tests passed
```

**Owner gaps (not fixable from here):**

1. **`NVIDIA_ASR_FUNCTION_ID` unset in prod** — `/api/v1/ai/asr` correctly
   503s `not_configured` instead of faking a response. Set it on the Cloud Run
   `three-ws-api` service (`gcloud run services update three-ws-api --region
   us-central1 --update-env-vars NVIDIA_ASR_FUNCTION_ID=<id>`); discover the
   live id with `node scripts/verify-nvidia-asr.mjs --list`.
2. **The `api/_lib/redis.js` timeout fix needs a production deploy** to take
   effect (`npm run deploy:gcp`, frontend rebuild first if touched — it wasn't
   here). **Did not deploy it myself this session**: the shared worktree
   currently has 100+ files modified by other concurrent agents' in-flight
   work (per `git status`), and `npm run deploy:gcp` would bundle all of that
   uncommitted state into a production release — well outside this work
   order's authority. The fix is committed to `main`/`threews` on its own
   commit so it can be deployed independently the next time a clean deploy
   runs.
3. Until that deploy ships, **any `/api/v1/*` POST route touching a
   never-before-used rate-limit bucket in a given warm instance can hang for
   the Upstash client's full internal retry ceiling** (observed well past 55s
   in this session before the client I used gave up) instead of returning the
   intended fail-closed 402/503/429. This is a live, user-facing reliability
   gap on production right now, not unique to `/api/v1/ai/tts` — flagging as
   the highest-priority deploy once picked up.

**Files touched this session:** `api/_lib/redis.js` (the fix),
`prompts/x402-catalog/PROGRESS.md` (this entry). No changes to the already-
shipped speech package files themselves — they were correct as found.
