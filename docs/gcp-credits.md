# GCP Credits & Vertex AI Runbook

The operational source of truth for three.ws's Google Cloud footprint: the
project, the credit grant, what's enabled, service accounts, env vars, quota,
and how to smoke-test Claude on Vertex. Prompts 02–08 append to this file as
they build on the foundation.

> **Status: foundation partially blocked on one owner action.** Every artifact
> that does not require live GCP auth is done (smoke test, dev-session helper,
> this runbook). The live steps — billing/credit confirmation, API enablement,
> service-account creation, Vercel env, quota, and the actual smoke call —
> are blocked because `gcloud` in this environment needs an interactive
> re-login (see **Pending human actions**). They run in minutes once that's done.

---

## Project

| Field | Value |
|---|---|
| **Project ID** | `aerial-vehicle-466722-p5` |
| Source of truth | Active `gcloud config` default in the dev container; the project the existing worker deploy flow and `api/_mcp3d/vertex-imagen.js` target. |
| Active gcloud account | The project owner's Google account (see team vault; not published here). |
| Known GCS buckets | `three-ws-model-weights`, `three-ws-avatar-reconstructions` |
| Default region | `us-central1` (Cloud Run + Imagen). Claude partner models use `global`. |

> Confirm the buckets live in this project once auth is restored:
> `gcloud storage buckets describe gs://three-ws-model-weights --format='value(name)'`
> If they resolve, the project ID above is correct. If not, run
> `gcloud projects list` and pick the project that owns them.

---

## Credits & partner-model coverage — GO/NO-GO (blocked)

**Not yet confirmed** — requires live auth. Run these the moment reauth lands:

```bash
# Billing account linked to the project
gcloud billing projects describe aerial-vehicle-466722-p5

# The billing account object (open/closed, master)
ACCT=$(gcloud billing projects describe aerial-vehicle-466722-p5 \
  --format='value(billingAccountName)')
gcloud billing accounts describe "$ACCT"
```

Credit **balance and expiry** are not exposed by the `gcloud billing` CLI. Read
them from the console:

- **Credits:** https://console.cloud.google.com/billing → select the account →
  **Credits**. Record remaining balance + expiry date (target: ~$100k expiring
  ~Sept 2026 — confirm the exact date).

**Critical coverage check (gates prompt 02's chain inversion):** determine
whether the credit grant covers **Vertex AI *partner* models** (Anthropic).
Google-for-Startups credits do; some promotional grants exclude third-party
publisher models.

- Console path: **Billing → Credits → click the credit** → read
  **"Eligible products / scope."** If it lists "Vertex AI" broadly it covers
  partner models; if it enumerates only Google-first-party services, partner
  spend (Claude) falls outside and would bill real money.
- **Owner question if ambiguous:** *"Does our GCP credit grant
  (account `<ACCT>`) cover Vertex AI Anthropic partner models, or Google-first-party
  services only?"* — answer determines whether prompt 02 can route production
  Claude traffic through Vertex credits.

Record here once confirmed:

| Field | Value |
|---|---|
| Billing account | `billingAccounts/01B467-A61905-9A97D2` — displayName **Sperax**, `open: true`, USD, org `530103279143` (verified 2026-07-07) |
| Credits applied | _pending — console Credits page (CLI cannot read it)_ |
| Remaining balance | _pending — console_ |
| Expiry date | _pending — console_ |
| Covers Anthropic partner models? | _pending — console check above_ |

---

## APIs to enable (blocked)

Idempotent — run once auth is restored:

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  compute.googleapis.com \
  bigquery.googleapis.com \
  cloudbilling.googleapis.com \
  monitoring.googleapis.com \
  --project aerial-vehicle-466722-p5

# Verify
gcloud services list --enabled --project aerial-vehicle-466722-p5 \
  --format='value(config.name)' | sort
```

| API | Enabled? |
|---|---|
| aiplatform.googleapis.com | ✅ 2026-07-07 |
| run.googleapis.com | ✅ 2026-07-07 |
| cloudbuild.googleapis.com | ✅ 2026-07-07 |
| storage.googleapis.com | ✅ 2026-07-07 |
| compute.googleapis.com | ✅ 2026-07-07 |
| bigquery.googleapis.com | ✅ 2026-07-07 |
| cloudbilling.googleapis.com | ✅ 2026-07-07 |
| monitoring.googleapis.com | ✅ 2026-07-07 |

Also enabled 2026-07-07: `billingbudgets.googleapis.com`, `pubsub.googleapis.com` (prompt 07 budgets/alerts).

---

## Service accounts

### Inventory

| SA | Purpose | Roles | Status |
|---|---|---|---|
| `avatar-reconstruction-sa@aerial-vehicle-466722-p5.iam.gserviceaccount.com` | Cloud Run workers (mesh/rig pipeline), used by `workers/deploy/*.sh` + cloudbuild | run/build identity | ✅ Confirmed valid 2026-07-07 |
| `vercel-inference@aerial-vehicle-466722-p5.iam.gserviceaccount.com` | Vercel functions → Vertex Claude + Imagen | `roles/aiplatform.user` | ✅ Created + role bound + key minted 2026-07-07 (key held locally, pending Vercel env push) |

### Create the Vercel inference SA (blocked)

Check-first, then create only if absent:

```bash
PROJECT=aerial-vehicle-466722-p5
SA=vercel-inference@${PROJECT}.iam.gserviceaccount.com

# Create only if it doesn't exist
gcloud iam service-accounts describe "$SA" --project "$PROJECT" 2>/dev/null \
  || gcloud iam service-accounts create vercel-inference \
       --project "$PROJECT" \
       --display-name "Vercel inference (Vertex Claude + Imagen)"

# Grant Vertex user
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" \
  --role roles/aiplatform.user

# Mint a JSON key to a path OUTSIDE the repo (never commit it)
gcloud iam service-accounts keys create /tmp/vercel-inference-key.json \
  --iam-account "$SA" --project "$PROJECT"
```

### Push credentials to Vercel (blocked — needs Vercel auth too)

`vercel` CLI is not installed in this container. Install + link, then set envs
for **all** environments (production, preview, development):

```bash
npm i -g vercel && vercel login && vercel link   # one-time

# Value = the raw key file contents. The api/ token parser tolerates the paste.
vercel env add GCP_SERVICE_ACCOUNT_JSON production   < /tmp/vercel-inference-key.json
vercel env add GCP_SERVICE_ACCOUNT_JSON preview      < /tmp/vercel-inference-key.json
vercel env add GCP_SERVICE_ACCOUNT_JSON development   < /tmp/vercel-inference-key.json

printf 'aerial-vehicle-466722-p5' | vercel env add GOOGLE_CLOUD_PROJECT production
printf 'us-central1'              | vercel env add GOOGLE_CLOUD_LOCATION production
printf 'global'                   | vercel env add GOOGLE_CLOUD_LOCATION_CLAUDE production
# …repeat the three non-secret vars for preview + development.

# Then delete the local key file
shred -u /tmp/vercel-inference-key.json 2>/dev/null || rm -f /tmp/vercel-inference-key.json

# Verify
vercel env ls
```

### Env vars (names only — never values here)

| Name | Value shape | Scope |
|---|---|---|
| `GCP_SERVICE_ACCOUNT_JSON` | Vercel inference SA key JSON | all envs |
| `GOOGLE_CLOUD_PROJECT` | `aerial-vehicle-466722-p5` | all envs |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | all envs |
| `GOOGLE_CLOUD_LOCATION_CLAUDE` | `global` | all envs |

---

## Enable Claude in Model Garden (owner console action)

Partner-model enablement is a **one-time console terms acceptance** — it cannot
be done from gcloud. Owner opens Model Garden for publisher `anthropic` and
clicks **Enable** on each model:

- Base console: https://console.cloud.google.com/vertex-ai/model-garden?project=aerial-vehicle-466722-p5
  (filter by publisher **Anthropic**), then enable:
  - `claude-haiku-4-5`
  - `claude-sonnet-4-6`
  - `claude-opus-4-8`
  - `claude-sonnet-5`
  - `claude-fable-5` (if listed in the region)

Accept the Anthropic terms once; enablement applies project-wide.

**Model ID mapping (repo default → Vertex):** the repo's default model string
`claude-haiku-4-5-20251001` maps to the Vertex snapshot form
`claude-haiku-4-5@20251001` (dated snapshots use `@`; current-gen bare IDs like
`claude-opus-4-8` work without a date).

---

## Quota (blocked)

Check current Vertex quotas and file increases sized for production chat:

```bash
# Inspect current online-prediction / partner-model quotas
gcloud alpha services quota list \
  --service=aiplatform.googleapis.com \
  --consumer=projects/aerial-vehicle-466722-p5 2>/dev/null | less
```

Console (most reliable for partner-model QPM/TPM): **IAM & Admin → Quotas &
System Limits**, filter service `Vertex AI API`, search the Anthropic model
tiers.

**Requested targets** (start; scale after go-live):

| Model tier | Region | QPM | TPM |
|---|---|---|---|
| Haiku 4.5 | `global` | 300 | 2,000,000 |
| Haiku 4.5 | `us-central1` | 300 | 2,000,000 |
| Sonnet (4.6 / 5) | `global` | 300 | 2,000,000 |
| Sonnet (4.6 / 5) | `us-central1` | 300 | 2,000,000 |

| Field | Value |
|---|---|
| Current values | _pending_ |
| Requested | per table above |
| Request IDs / status | _pending_ |

---

## Smoke test — is Claude on Vertex live?

`scripts/gcp/vertex-smoke.mjs` sends a real streaming request to a Claude
partner model and prints the reply. It reads `GCP_SERVICE_ACCOUNT_JSON` from the
environment (same var Vercel uses) and needs no SDK. Run it the moment Model
Garden enablement + the SA key are in place:

```bash
export GOOGLE_CLOUD_PROJECT=aerial-vehicle-466722-p5
export GCP_SERVICE_ACCOUNT_JSON="$(cat /path/to/vercel-inference-key.json)"
node scripts/gcp/vertex-smoke.mjs
```

- **PASS** = `HTTP 200 — model replied: "…"`. Enablement, quota, billing all live.
- **403 / 404** = Claude not enabled in Model Garden yet, or the SA lacks
  `roles/aiplatform.user`. The script prints the exact Model Garden URL.
- **429** = quota exceeded — file the increase above.

Optional overrides: `GOOGLE_CLOUD_LOCATION_CLAUDE` (default `global`),
`VERTEX_SMOKE_MODEL` (default `claude-haiku-4-5@20251001`), `VERTEX_SMOKE_PROMPT`.

---

## Claude Code dev sessions → GCP credits

`scripts/gcp/claude-code-vertex.sh` routes a Claude Code dev session through
Vertex so development spend draws down the credit pool. **Opt in by sourcing**
it — it is deliberately NOT set globally in the devcontainer, so each session
picks its billing lane.

```bash
# One-time per machine (interactive):
gcloud auth application-default login

# Per shell you want on Vertex credits:
source scripts/gcp/claude-code-vertex.sh
claude          # this session now bills to GCP credits
```

It exports `CLAUDE_CODE_USE_VERTEX=1`, `ANTHROPIC_VERTEX_PROJECT_ID`,
`CLOUD_ML_REGION=global`, and warns if ADC is missing. Open a fresh shell to opt
back out.

---

## Vertex Claude LLM lane (chat & completions) — prompt 02

Routes the platform's Claude/Anthropic LLM traffic through Vertex AI so it bills
the GCP credit pool instead of a paid Anthropic key. Wired across **every** text
inference surface, behind two flags, with automatic fallthrough to the existing
free-first chain on any Vertex failure. Flags off ⇒ behavior is byte-identical to
before (proven by `tests/vertex-claude.test.js`).

### Flags

| Env var | Effect |
|---|---|
| `VERTEX_CLAUDE_ENABLED=1` | Vertex becomes an available Anthropic transport. In `llm.js`/`api/chat.js` it sits in the paid tier **ahead of** first-party Anthropic (GCP credits before a paid key); in `api/llm/anthropic.js` any `provider: anthropic` model streams from Vertex with first-party as the fallback; `/api/brain/chat` gains selectable "· Vertex" Claude rows. |
| `VERTEX_CLAUDE_PRIMARY=1` | Chain inversion: Vertex Claude is tried **first**, before the free lanes — the platform's default brain becomes real Claude on Vertex. Requires `VERTEX_CLAUDE_ENABLED`. A caller BYOK key still leads (their own billing choice). |

Both require `GOOGLE_CLOUD_PROJECT` (config check). Location: `GOOGLE_CLOUD_LOCATION_CLAUDE`
(default `global`). Both unset ⇒ zero code-path change.

### Wire format & model mapping

Vertex speaks the Anthropic Messages API with four differences, all handled in
`api/_lib/vertex-claude.js` (the one shared module — never scatter this):

- Model id in the **URL path**, not the body: `…/publishers/anthropic/models/<id>:streamRawPredict` (stream) / `:rawPredict` (non-stream). Regional endpoints prefix the host (`us-east5-aiplatform.googleapis.com`); `global` uses the bare host.
- Body gains `"anthropic_version": "vertex-2023-10-16"` and drops `model` (+ `stream`).
- Auth: `Authorization: Bearer <oauth>` (via `api/_lib/gcp-auth.js` — shared with Imagen) — no `x-api-key`, no `anthropic-version` header.
- Model id: bare aliases pass through (`claude-sonnet-4-6`); a dated first-party id converts to the `@` form (`claude-haiku-4-5-20251001` → `claude-haiku-4-5@20251001`) via `toVertexModelId()`.

SSE event shapes are identical to first-party, so every existing stream parser works unchanged.

### Surfaces wired

| Surface | Entry point | How Vertex is chosen |
|---|---|---|
| Server one-shot completions (agent talk/delegation, personas, x402, crons, vision) | `api/_lib/llm.js` `providerChain()` | `vertexAnthropicProvider()` inserted per flags |
| Embedded avatar/agent chat widgets (streaming) | `api/llm/anthropic.js` | `provider: anthropic` models routed to Vertex `streamRawPredict`; `x-llm-transport` response header records the transport |
| Main viewer/agent chat (streaming) | `api/chat.js` `providerOrder()` | synthetic `vertex` provider injected into the ladder |
| `/brain` comparison page | `api/brain/chat.js` | "Claude … · Vertex" specs via `streamVertex()` |

### Telemetry marker

Vertex traffic is recorded as provider **`vertex-anthropic`** distinctly from
first-party `anthropic` (in `recordEvent` for `llm.js`/`api/llm/anthropic.js`, and
`meta.provider` for `api/chat.js` via `route.via`), so prompt 07's spend reporting
attributes it. The embed proxy also returns an `x-llm-transport: vertex-anthropic`
response header.

### Smoke test (needs a running dev server + creds)

`scripts/gcp/vertex-llm-smoke.mjs` hits three live surfaces and asserts Vertex served
each. (Distinct from prompt 01's `vertex-smoke.mjs`, which is a single raw Claude call.)

```bash
GOOGLE_CLOUD_PROJECT=aerial-vehicle-466722-p5 \
GCP_SERVICE_ACCOUNT_JSON="$(cat /path/to/vercel-inference-key.json)" \
VERTEX_CLAUDE_ENABLED=1 VERTEX_CLAUDE_PRIMARY=1 npm run dev   # terminal 1

node scripts/gcp/vertex-llm-smoke.mjs                          # terminal 2
#   (a) POST /api/forge-enhance → asserts provider=vertex-anthropic
#   (b) POST /api/llm/anthropic  → asserts x-llm-transport=vertex-anthropic  (set SMOKE_AGENT_ID)
#   (c) POST /api/chat           → asserts done.provider=vertex              (set SMOKE_BEARER)
```

Browser verification (definition of done): with the flags on, open an embedded agent
widget page and the main chat, send messages, confirm streamed replies + no console
errors + `vertex-anthropic` in server logs; then unset the flags and confirm today's
behavior is intact.

### Deploy & rollback

- **Preview first:** set `VERTEX_CLAUDE_ENABLED=1` (and optionally `VERTEX_CLAUDE_PRIMARY=1`) in Vercel **preview** only. Production flags stay unset — flipping production changes the billing lane and is the owner's call.
- **Production flip (owner):** `printf '1' | vercel env add VERTEX_CLAUDE_ENABLED production` (+ `VERTEX_CLAUDE_PRIMARY` for chain inversion), then redeploy.
- **Rollback (instant, no code deploy):** unset `VERTEX_CLAUDE_ENABLED` / `VERTEX_CLAUDE_PRIMARY`. Every lane falls through to Groq → OpenRouter → NVIDIA → paid backstop exactly as before.

---

## Vertex image lane (text→3D reference images) — prompt 03

The forge text→3D chain synthesizes a reference image, then reconstructs a GLB
from it (TRELLIS / Hunyuan3D). That image step can bill to GCP credits instead of
NVIDIA NIM FLUX / Replicate. Client: `api/_mcp3d/vertex-imagen.js`; selector:
`api/_mcp3d/text-to-image.js`.

### Model landscape — Imagen `:predict` is being retired (verified 2026-07)

The dormant client defaulted to `imagen-3.0-generate-001`. That endpoint is **dead**:
Google is shutting down the entire Imagen `:predict` family.

| Model | API shape | Status (2026-07) |
|---|---|---|
| `imagen-3.0-generate-001` / `-002` | `:predict` | Shut down ~**2026-06-30** (404s now) |
| `imagen-3.0-capability-001` (edit) | `:predict` | Retired ~**2026-06-30**, no mask-edit successor |
| `imagen-4.0-generate-001` / `-fast` / `-ultra` | `:predict` | Deprecated; discontinued **2026-06-30…2026-08-17** |
| **`gemini-2.5-flash-image`** ("Nano Banana") | `:generateContent` | **GA, recommended** — bills to the same GCP credits |

So the client now **defaults to `gemini-2.5-flash-image`** and routes on the model id:
`gemini*` → `:generateContent`; `imagen*` → legacy `:predict` (for an explicit
override while any Imagen endpoint is still callable). It also handles the `global`
location (un-prefixed host).

### Flag & models

| Env var | Default | Meaning |
|---|---|---|
| `VERTEX_IMAGEN_ENABLED` | unset ⇒ **on when `GOOGLE_CLOUD_PROJECT` set** | Explicit lane switch, decoupled from the shared project var (which Vertex Claude + workers also need). Set `0`/`false`/`no`/`off` to force the image lane off without unsetting the project. |
| `VERTEX_IMAGEN_MODEL` | `gemini-2.5-flash-image` | Generation model. An `imagen-*` value uses the legacy `:predict` path. |
| `VERTEX_IMAGEN_EDIT_MODEL` | `gemini-2.5-flash-image` | Edit model (`editImage()`); `imagen-*` routes to `:predict` inpainting. |

Ladder is unchanged and fully preserved: **NIM FLUX → Vertex → Replicate**, with
any Vertex error degrading cleanly to FLUX. Which provider served each image is
logged (`[text-to-image] served by <model>`) and persisted on the forge job as
`text_to_image_model`.

### Verification status

Static verification is **done**: model IDs checked against live Vertex docs; both
request/response shapes and the gate + fallback are covered by unit tests
(`tests/api/vertex-imagen.test.js`, `tests/api/text-to-image.test.js` — green).

**Live E2E passed 2026-07-07**: `generateImage()` against the real project
(`vercel-inference` SA key, `us-central1`) returned a 901 KB on-prompt PNG —
`served by vertex-ai/gemini-2.5-flash-image`, isolated subject on a plain white
background, visually verified. Remaining before *production* enablement: the
3–4-prompt reconstruction-quality comparison vs the FLUX lane (below), and the
Vercel env push. The command used:

```bash
export GOOGLE_CLOUD_PROJECT=aerial-vehicle-466722-p5
export GOOGLE_CLOUD_LOCATION=us-central1          # or "global" if the model requires it
export GCP_SERVICE_ACCOUNT_JSON="$(cat /path/to/vercel-inference-key.json)"
export VERTEX_IMAGEN_ENABLED=1
node -e '
  import("./api/_mcp3d/vertex-imagen.js").then(async ({ generateImage }) => {
    const { imageUrl, model } = await generateImage("a stylized red robot, isolated subject, plain white background", { aspectRatio: "1:1" });
    const b64 = imageUrl.split(",")[1];
    require("fs").writeFileSync("/tmp/vertex-sample.png", Buffer.from(b64, "base64"));
    console.log("served by", model, "→ /tmp/vertex-sample.png");
  });
'
```

Inspect `/tmp/vertex-sample.png` (must be a real, on-prompt image), then compare
3–4 prompts against the FLUX lane before promoting: Gemini image output is
photoreal-leaning, so for **stylized 3D reference** images sanity-check that
reconstruction quality holds. If it regresses, keep the image lane on FLUX
(`VERTEX_IMAGEN_ENABLED=0`) and use Vertex only for the seed/draft lanes.

### Deploy & rollback

- **Preview first:** `printf '1' | vercel env add VERTEX_IMAGEN_ENABLED preview`.
  Exercise `/api/forge` (text mode) and confirm the log shows
  `served by vertex-ai/gemini-2.5-flash-image`.
- **Production** only after the quality gate passes cleanly:
  `printf '1' | vercel env add VERTEX_IMAGEN_ENABLED production`.
- **Rollback (instant, no deploy):** set `VERTEX_IMAGEN_ENABLED=0` in the affected
  environment — the lane drops to NIM FLUX → Replicate immediately. Removing
  `GOOGLE_CLOUD_PROJECT` also disables it but would break Vertex Claude/workers, so
  prefer the flag. To pin a specific model instead, set `VERTEX_IMAGEN_MODEL`.

---

## Pending human actions (do these, in order)

1. ~~**Restore gcloud auth**~~ — ✅ done 2026-07-07 (`gcloud auth login`,
   project `aerial-vehicle-466722-p5`). **Still pending:** `gcloud auth
   application-default login` (ADC) — needed only for Claude Code dev sessions
   on Vertex and any script that insists on ADC; everything below used the
   user token / SA key instead.
2. **Confirm credits + partner-model coverage** — console Credits page; answer
   the coverage question (see that section). This is the GO/NO-GO for prompt 02.
3. **Enable Claude in Model Garden** — console, accept Anthropic terms, enable
   the five model IDs listed above. **Confirmed still missing 2026-07-07:** the
   smoke test returns `IAM_PERMISSION_DENIED` on
   `publishers/anthropic/models/*` while the same SA serves Gemini images fine —
   the terms acceptance is the only remaining gate.
4. ~~**Run the live setup block**~~ — ✅ done 2026-07-07: APIs enabled (table
   above), `vercel-inference` SA created + `roles/aiplatform.user` bound, key
   minted (held locally outside the repo, pending Vercel push). Quota filing
   still open (partner-model QPM/TPM — console).
5. **Install + auth the Vercel CLI** (`npm i -g vercel && vercel login`) so
   `GCP_SERVICE_ACCOUNT_JSON` + the three location vars can be pushed and
   verified with `vercel env ls`.
6. **Run the smoke test** — `node scripts/gcp/vertex-smoke.mjs`. Attempted
   2026-07-07: 403 (Model Garden — step 3). The Gemini image-lane E2E **passed**
   the same day with the same SA, proving auth, API enablement, and the client
   code end-to-end. Re-run after step 3; a green PASS closes prompt 01.
7. **Enable the BigQuery billing export** (prompt 07) — console-only:
   Billing → Billing export → BigQuery. Confirmed 2026-07-07 that no dataset
   exists yet (`bq ls` empty; `burn-report.mjs` → "export not configured").

Update the _pending_ cells in this file as each step completes.


---
---

# Premium vanity inventory (prompt 06)

Grind long, brandable Solana vanity addresses **ahead of time** on cheap spot CPU
and sell them from stock via a new x402 tier — the durable, near-zero-marginal-cost
"asset factory" use of the credits. The live grinder (`/api/x402/vanity`, the
`vanity_grinder` MCP tool) still handles fresh ≤3-char grinds; this is the 4–5+
char **sell-from-stock** lane.

## Shape

```
targets → workers/vanity-grinder (spot CPU) → seal in-process → vanity_inventory (ciphertext)
                                                                        │
        browse: /vanity/premium ── /api/x402/vanity-premium (list) ─────┤
        buy:    /api/x402/vanity-premium?address=… (x402) → reserve → settle → reveal ONCE → destroy
```

- **Grinder:** `workers/vanity-grinder/` (Node + the same Rust/WASM ed25519 engine
  as the serverless tier, one worker/vCPU). Seals every key with
  `api/_lib/vanity-vault.js` **before any write**; writes only ciphertext.
  Resumable (checkpoint) and SIGTERM-clean for spot preemption.
- **Store:** `vanity_inventory` (migration `20260706120000_vanity_premium_inventory.sql`),
  atomic single-use reveal in `api/_lib/vanity-inventory-store.js`.
- **Sell:** `api/x402/vanity-premium.js` (list + buy + one-time delivery),
  browsable at `/vanity/premium`, plus the free `vanity_premium` MCP browse tool.
- **Encryption:** secret-box AES-256-GCM (`WALLET_ENCRYPTION_KEY`) by default —
  the platform's custodial-key pattern — with an **optional GCP-KMS envelope**
  (`VANITY_KMS_KEY`) that gates decrypt to the delivery identity via IAM.

## Run it (owner, once gcloud auth is restored)

```bash
export PROJECT_ID=aerial-vehicle-466722-p5

# 1) (recommended) KMS envelope — decrypt granted ONLY to the delivery SA:
./scripts/gcp/vanity-kms-setup.sh                 # prints VANITY_KMS_KEY

# 2) Put the vault secrets in Secret Manager (grinder + delivery both need them):
#    WALLET_ENCRYPTION_KEY, JWT_SECRET, DATABASE_URL   (and VANITY_KMS_KEY as env)

# 3) Build + run the grinder on spot CPU, writing straight to the DB:
VANITY_KMS_KEY=<from step 1> WRITE_DB=1 TASKS=8 CPU=8 \
  ./scripts/gcp/vanity-grind-deploy.sh --run        # Cloud Run Job (spot)
#   …or a GCE spot MIG for very large runs:
#   ./scripts/gcp/vanity-grind-deploy.sh --mig --instances 20

# 4) (file path) load an encrypted JSONL a run produced into the DB:
node scripts/vanity-inventory-load.mjs --file workers/vanity-grinder/out/inventory.jsonl
node scripts/vanity-inventory-load.mjs --stats
```

Migration first: `npm run db:migrate` (applies `20260706120000_vanity_premium_inventory.sql`).

## Measured throughput & $/address

Measured on a 16-vCPU dev box (the container's per-vCPU rate is identical — it's the
same WASM engine, one worker per core):

| metric | value |
|---|---|
| Throughput / vCPU | **~25,070 keys/sec** |
| Throughput, 16 vCPU | **~400k keys/sec** |
| Real run | 50+ addresses ground, all round-trip-verified (address = derived pubkey), all sealed at rest |

Cost at c2d **spot** ≈ $0.015 / vCPU-hour (25k keys/sec/vCPU). Price is value-based
($1–$50 by rarity), so the margin is enormous — the entire point of grinding on
free credits:

| pattern | expected attempts | vCPU-seconds | **$/address (spot)** | list price |
|---|---:|---:|---:|---:|
| 3-char, case-insensitive | ~36k | 1.4 | $0.000006 | $1 |
| 4-char, case-insensitive | ~1.2M | 47 | $0.0002 | $2–$5 |
| 4-char, case-sensitive | ~11.3M | 452 | $0.0019 | $6–$13 |
| 5-char, case-sensitive | ~656M | 26,244 | $0.11 | $30–$50 |

**Finding — Base58 leading-char bias:** a 32-byte value's *leading* Base58 char is
**not** uniformly distributed, so a case-**sensitive** prefix can be far harder than
the naive 58ⁿ estimate (some leading chars are near-impossible). The grinder caps
per-target attempts (`MAX_ATTEMPTS_PER_TARGET`, default 200M) and gives up on such
targets instead of hanging a worker. **Case-insensitive prefixes and suffixes
(uniform tail) are dramatically cheaper per useful address** — weight target lists
toward them. Revenue math: even 200 addresses cost cents of credits to grind and
list at $1–$50 each — a four-figure sellable asset for a near-zero credit outlay.

## Security review (threat model)

The store holds **real private keys**; the design defends each realistic threat:

| threat | mitigation |
|---|---|
| **DB dump** | Keys are AES-256-GCM (or KMS-envelope) ciphertext with a random per-record salt. A dump yields no spendable key without `WALLET_ENCRYPTION_KEY` (and, under KMS, a live IAM-gated decrypt call). |
| **Log leakage** | No secret is ever logged. The grinder's only "found" line is the public address + attempt count; the endpoint strips secret fields from the idempotency cache; the store's public reads select an explicit column list that omits `secret_ciphertext`. Verified by grep (`git grep -nE 'console.*(secretKey|privateKey|ciphertext)'` over the new files → none). |
| **Delivery replay / double-spend** | Single-use is a server-side atomic CTE (`reserveAndReveal`): the reveal flips status and nulls the ciphertext in one statement guarded by `status IN ('reserved','sold') AND secret_ciphertext IS NOT NULL`. A second call captures zero rows → `already_revealed`. The x402 idempotency cache stores a secret-free copy. |
| **Charge-without-delivery** | The endpoint decrypts (non-destructive peek) **before** settling; a KMS/decrypt outage fails the purchase *before* charging. Settle → reveal(destroy) only after decrypt is proven. |
| **Insider access** | With `VANITY_KMS_KEY` set, decrypt is granted (IAM) **only** to the delivery service identity and every decrypt is Cloud-Audit-Logged; the grinder SA gets encrypt-only. An env-var leak alone no longer decrypts the inventory. |
| **Custody dishonesty** | Every listing + delivery carries the required disclosure: platform-generated keys → use as a token mint or sweep to self-generated custody, not a treasury. Delete-after-reveal (retention 0) is the default. |

## Revert / wind-down

One-shot asset — nothing to revert. The inventory persists in the app DB and sells
down at **zero ongoing GCP cost** after the grind. Tear down the grinder MIG/Job
when a batch finishes (the deploy script prints the command). See the keep/kill
table below.

---
---

# Expiry revert & keep/kill runbook (prompt 08)

The credits expire (~$100k, target ~Sept 2026 — confirm the exact date on the
console Credits page). This section makes that a non-event: a proven, env-only
path back to the pre-program providers, plus a data-driven keep/kill call per lane.

**Core fact:** every credit-funded reroute is gated by an env var, and each lane
already falls through to the provider it displaced. So the revert is a config
change, never a code migration. Proven at the code level by
`tests/api/gcp-revert.test.js` (7 assertions, green).

## The lanes and how each reverts

| Lane | Gate (present ⇒ GCP lane live) | Reverts to | Code |
|---|---|---|---|
| **Vertex Claude** (chat/LLM) | `VERTEX_CLAUDE_ENABLED` (+`_PRIMARY`), needs `GOOGLE_CLOUD_PROJECT` | Groq → OpenRouter → NVIDIA → paid backstop | `api/_lib/vertex-claude.js`, `api/chat.js` `providerOrder()` |
| **Vertex Imagen** (text→image) | `GOOGLE_CLOUD_PROJECT` (+`GCP_SERVICE_ACCOUNT_JSON`) | free NIM FLUX → Replicate | `api/_mcp3d/vertex-imagen.js`, `text-to-image.js` |
| **Forge TRELLIS self-host** | `MODEL_TRELLIS_URL` + `GCP_RECONSTRUCTION_KEY` | free NIM/HF → Replicate | `api/_lib/forge-tiers.js` |
| **Forge Hunyuan3D self-host** | `GCP_HUNYUAN3D_URL` + `GCP_RECONSTRUCTION_KEY` | free HF Spaces → Replicate | `forge-tiers.js` |
| **Forge TripoSG sketch** | `GCP_TRIPOSG_URL` + `GCP_RECONSTRUCTION_KEY` | none — option hides | `forge-tiers.js` |
| **Game-Ready remesh** | `GCP_REMESH_URL` + `GCP_RECONSTRUCTION_KEY` | none — export hides | `forge-tiers.js` (`OUTPUTS`) |
| **Avatar reconstruct/rerig** | `GCP_RECONSTRUCTION_URL` + `_KEY` | Replicate → HF Spaces | `api/_lib/regen-provider.js` |
| **Editing** (rembg/texture/segment) | `GCP_REMBG_URL` / `GCP_TEXTURE_URL` / `GCP_SEGMENT_URL` | in-lane fallback / off | `workers/deploy/deploy-editing.sh` |
| **Vanity inventory** | — (one-shot; already ground) | n/a — sells down | `api/_lib/vanity-inventory-store.js` |

## Revert runbook (a tired human at 2am can follow this)

Tooling: `scripts/gcp/revert-to-free.sh` (this is the planned revert; the panic
sibling for a runaway bill is `scripts/gcp/emergency-stop.sh`).

**Step 0 — confirm the fallbacks exist before pulling any gate.** The only way
this breaks a feature is removing a GCP gate while its fallback is also unset.
Confirm in Vercel prod: `NVIDIA_API_KEY` (free NIM), `HF_TOKEN` (free HF),
`REPLICATE_API_TOKEN` (paid backstop). The script's pre-flight checks this and
warns per lane:
```bash
scripts/gcp/revert-to-free.sh          # dry-run: full plan + per-lane pre-flight, changes nothing
```

**Step 1 — remove the env gates from Vercel** (the script prints the exact
`vercel env rm … production/preview` for every var). Removing the gate *is* the
revert. Groups: the `VERTEX_CLAUDE_*` flags; the Imagen vars; the forge
`GCP_*_URL`/`MODEL_TRELLIS_URL`/`GCP_RECONSTRUCTION_*`; the editing URLs. Then:
```bash
vercel --prod
```

**Step 2 — drop Cloud Run workers to min-instances=0.** The deploy scripts never
set `--min-instances`, so workers are already scale-to-zero; this is an idempotent
confirm:
```bash
scripts/gcp/revert-to-free.sh --apply      # min-instances=0 on every worker
```

**Step 3 — verify (2 min):**
- `curl "$SITE/api/forge?catalog=1"` → GCP backends show `"configured": false`; free NIM/HF show `true`.
- text→3D routes to free NIM, photo→3D to free HF, avatar reconstruct to Replicate/HF — all succeed.
- a text→image returns from `nvidia` (not `vertex-ai/*`); a chat completion's `route.via` is a free provider (not `vertex-anthropic`).

## Proving the revert

- **Automated (CI):** `npx vitest run tests/api/gcp-revert.test.js` — flips each
  gate and asserts the fallthrough (forge self-host→HF→Replicate; avatar
  gcp→replicate→hf→none; Imagen `isConfigured` off; Vertex Claude
  `vertexClaudeEnabled`/`vertexClaudePrimary` off). This locks the mechanism.
- **Live preview (owner, needs Vercel+GCP creds):** in a preview, set the gates →
  confirm lanes serve from GCP; run the Step-1 removals → confirm every feature
  still works on the free/original providers. The `?catalog=1` check makes this a
  2-minute confirmation, not an investigation.

## Keep / kill — post-expiry economics

Pull **real per-lane spend and volume** from the burn report (prompt 07):
```bash
node scripts/gcp/burn-report.mjs            # human-readable: spend by lane (vertex-claude|imagen|forge-gpu|vanity)
node scripts/gcp/burn-report.mjs --json     # machine-readable, for the decision below
```
The decision *math* below is fixed; plug the lane's actual spend/volume into it.

**Cloud Run L4 unit cost** (verify the current L4 rate; worked example at
≈ $0.71/GPU-hr = $0.000197/GPU-sec):

| Lane | Active/asset | Warm | Cold |
|---|---|---|---|
| TRELLIS self-host (standard) | ~60 s | ~$0.012 | ~$0.024 |
| Hunyuan3D self-host (high) | ~120 s | ~$0.024 | ~$0.039 |
| TripoSG sketch | ~45 s | ~$0.009 | ~$0.018 |
| Remesh (Game-Ready) | ~35 s | ~$0.007 | ~$0.010 |

Retail prices (`api/_lib/forge-tiers.js`, source of truth): **draft $0.05,
standard $0.15, high $0.50; Game-Ready $0.10.** (The prompt's "$0.25/$0.45" are stale.)

| Lane | Recommendation | Why (math) |
|---|---|---|
| **Vertex Claude** | **Keep only if Vertex ≤ first-party Anthropic per token AND quality holds; else revert to free lanes** | Chat's free tier (Groq/OpenRouter/NVIDIA) costs $0 and already carries prod. Vertex Claude earns its keep only where quality needs a frontier model AND the Vertex partner-model token price beats calling Anthropic first-party. Compare `burn-report.mjs` vertex-claude spend ÷ tokens vs Anthropic list price. If Vertex ≈ Anthropic, revert to first-party (one less dependency); if free lanes suffice for the traffic, revert to free. |
| **Forge self-host — FREE-tier gens** | **Kill (revert to NIM/HF)** | Self-host serves free-first, so most gens earn **$0**. On credits: ~100% margin. Post-expiry: **$0.012–0.039 GPU for $0 revenue = pure loss.** Free NIM/HF cost $0 and cover these. |
| **Forge self-host — PAID x402 gens** | **Keep iff paid volume clears the floor** | Paid standard: **$0.15 − ~$0.012–0.024 ≈ 6–12× margin.** High: **$0.50 − ~$0.024–0.039 ≈ 13–20×.** Great per-call, but scale-to-zero means cold starts and near-idle GPU at low volume. Keep only if `burn-report.mjs` forge-gpu paid-gen volume beats Replicate (~$0.03–0.05/run, zero idle); else revert paid tiers to Replicate too. |
| **Vertex Imagen** | **Kill (revert)** | Free **NIM FLUX already leads** the chain; Imagen only serves when NIM is absent/down. On credits it was a free quality bump (~$0.02–0.04/img); post-expiry it's real money for a rarely-leading lane. NIM (free) + Replicate ($0.003) cover it. |
| **Avatar reconstruct/rerig** | **Revert to Replicate** | `resolveProviderName()` already prefers Replicate; its pinned reliability at per-run cost beats idle GPU unless reconstruct volume is high (check the report). |
| **Editing workers** | **Revert / delete at teardown** | Auxiliary, low value; degrade to in-lane fallback or hide. No standing cost once min-instances=0. |
| **Vanity inventory** | **Done — keep the assets** | One-shot batch already ground; inventory persists in the app store and sells down at **zero ongoing GCP cost.** |

**Bottom line:** revert everything to free/original providers at expiry. The only
lanes worth keeping on paid GCP are (a) forge **paid-tier** generation if the burn
report shows enough paid volume to beat Replicate, and (b) Vertex Claude only where
its token price beats first-party Anthropic — both numbers to pull on the day.

## Durable-asset audit — nothing user-facing dies with the credits

No committed data or served page references a `gs://` or `*.run.app` URL (grepped
`data/`, `public/`). Every durable output is on R2, independent of GCP:

| Asset | Lives on | Dies with credits? |
|---|---|---|
| Generated GLBs (forge/avatar) | R2 | No — GCS `OUTPUT_BUCKET` is only the pipeline's internal handoff |
| Seeded avatar catalog / animation library | R2 + repo data | No |
| Vanity inventory | app store / R2 | No |
| Model weights | GCS `WEIGHTS_BUCKET` | Yes, **but re-downloadable** (HuggingFace) — safe to delete, re-stage via `workers/deploy/stage-weights.sh` |

**One dependency to watch:** avatar reconstruct routes to `gcp` when *only*
`GCP_RECONSTRUCTION_URL` is set. If a deployment has no `REPLICATE_API_TOKEN` and
no `HF_TOKEN`, reverting turns reconstruction off. Step-0 pre-flight catches this —
ensure a non-GCP reconstruct provider key is in Vercel prod before the revert. No
blocking fixes filed; the fallback chains already exist in code.

## Teardown plan — stop all post-credit billing

Run **after** the revert is verified and traffic has drained.
`scripts/gcp/teardown.sh` is **dry-run by default** — do NOT run it now.
```bash
scripts/gcp/teardown.sh                       # dry-run: list what it would delete
scripts/gcp/teardown.sh --apply               # Cloud Run + Artifact Registry + weights bucket + secret + SA
scripts/gcp/teardown.sh --apply --include-output   # ALSO the OUTPUT bucket (confirm R2 copy first)
```
Deletes the GPU/controller Cloud Run services, the docker Artifact Registry repo,
the (re-downloadable) `WEIGHTS_BUCKET`, the worker secret, and the runtime SA.
Keeps the `OUTPUT_BUCKET` unless `--include-output`. Never auto-deletes: the
Firestore `(default)` DB or the GCP project (prints the commands for both).

## Owner one-pager

- **Permanent (survives the credits):** the forge quality/lane system (free-first,
  GCP + paid vendors behind env gates), Vertex Imagen path, avatar reconstruct with
  a 3-provider chain, the Vertex Claude chat lane (flag-gated), the vanity inventory
  (one-shot, sold down), and all generated assets on R2. **None depend on the credits
  to keep working** — the GCP lanes were preferred routes, not load-bearing.
- **Total credits used:** `node scripts/gcp/burn-report.mjs` (needs the BigQuery
  billing export configured; see its header). Program budget targets: Claude-on-Vertex
  $40–60k, GPU fleet $15–25k, Imagen $3–5k, misc ~$5k.
- **Day-of revert:** `scripts/gcp/revert-to-free.sh` (dry-run → read pre-flight →
  paste the `vercel env rm` block → `vercel --prod` → `--apply` for min-instances=0 →
  verify with `?catalog=1`). ~10 min, zero user-visible breakage.
- **Keep/kill in one line:** revert everything to free/original providers; keep paid
  GCP only for (a) forge paid-tier gens if the burn report shows the volume, and
  (b) Vertex Claude where its token price beats first-party Anthropic.
- **Then:** `scripts/gcp/teardown.sh --apply` to delete the idle resources and zero the bill.

_Revert section last verified against source: 2026-07-06._

---

## GPU worker fleet — self-hosted 3D stack (prompt 04)

Deploys the six Cloud Run L4 GPU workers that back the forge lanes so the paid
lane stops paying Replicate and the free lane stops being throttled by hosted
NVIDIA NIM: **TRELLIS** (text/image→3D), **Hunyuan3D**, **TripoSG** (sketch→3D),
**TripoSR** (fast mesh), **UniRig** (auto-rig), **text2motion**. Everything
reverts by unsetting env URLs and the `FORGE_SELFHOST_PRIMARY` flag.

> **Status: code wired & tested; deploy blocked on the same gcloud reauth as the
> foundation above.** The router flag, raised free-lane ceilings, and their tests
> are landed and green. The six `gcloud builds submit` deploys, weight staging,
> Vercel env wiring, and E2E verification all need live GCP auth (**Pending human
> actions**, step 1). Latency/cost cells below are **pre-deploy estimates** — the
> exact command to replace them with measured values is in *Cost per asset*.

### Router wiring (landed, flag-gated, OFF by default)

Self-host was already the health-aware default when its worker URLs are set
(`api/_lib/forge-tiers.js` — `freeLaneCandidates` → `resolveBackendIdWithHealth`).
Prompt 04 adds one flag that makes the fleet *primary* across every tier/path:

- **`FORGE_SELFHOST_PRIMARY=1`** — `freeLaneCandidates` hoists the self-host lanes
  (`trellis_selfhost`, `hunyuan3d`, `triposg`) ahead of the hosted free lanes
  (NVIDIA NIM, HuggingFace) for **text** prompts too (photos already led with
  self-host, since NIM's preview rejects user images). Stable partition — hosted
  lanes stay intact as fallthrough. A no-op until the worker URLs are configured
  (unconfigured lanes are filtered out anyway). `api/_lib/forge-tiers.js`
  `selfHostPrimary()`.
- The **fallback ladder is unchanged**: self-host error → hosted NIM / HuggingFace
  / Replicate exactly as today. The flag only reorders *preference*, never removes
  a safety net.
- **Revert:** unset `FORGE_SELFHOST_PRIMARY` (and/or the worker URLs) → today's
  ordering, no redeploy.

Env vars the router reads for the fleet (all bearer-authed with
`GCP_RECONSTRUCTION_KEY`):

| Env var | Backend | Forge lane |
|---|---|---|
| `MODEL_TRELLIS_URL` | `trellis_selfhost` | free/paid image + text→3D (primary) |
| `GCP_HUNYUAN3D_URL` | `hunyuan3d` | image→3D failover |
| `GCP_TRIPOSG_URL` | `triposg` | sketch→3D |
| `GCP_RECONSTRUCTION_URL` | controller `/reconstruct`, `/rig` | avatar scan + UniRig rigging |
| `GCP_TEXT2MOTION_URL` | text2motion | text→animation clip |
| `GCP_RECONSTRUCTION_KEY` | shared bearer | all of the above |

### Per-service Cloud Run config

From each worker's `cloudbuild.yaml`. All are `--gpu=1 --gpu-type=nvidia-l4
--no-gpu-zonal-redundancy --no-cpu-throttling`, region `us-central1` (co-located
with `three-ws-model-weights`). Weights mount read-only at `/weights` from the
bucket; every worker uses the async **`POST` → 202 + poll `GET /tasks/{id}`**
pattern, so the Cloud Run request timeout does **not** gate generation (the long
work runs post-response under `--no-cpu-throttling`) — no timeout bump is needed.

| Service | CPU / Mem | min→max inst | `MAX_CONCURRENT` | req timeout |
|---|---|---|---|---|
| `model-trellis` | 8 / 32Gi | **1**→2 | 1 | 300s |
| `model-hunyuan3d` | 8 / 32Gi | 0→3 | 1 | 300s |
| `model-triposg` | 8 / 32Gi | 0→2 | 1 | 300s |
| `model-triposr` | 4 / 16Gi | 0→2 | 2 | 120s |
| `unirig` | 4 / 16Gi | **1**→2 | 1 | 180s |
| `model-text2motion` | 4 / 16Gi | 0→2 | 2 | 120s |

**Credit-window override — min-instances 1 for `model-trellis` and `unirig`.**
Cold-start on L4 + model load is brutal and instances are ~free on credits, so
pin the two hottest lanes warm. This is a *temporary* deploy-time override, not
baked into `cloudbuild.yaml` (min=1 costs money after the credits expire — prompt
08 reverts it). `deploy-all.sh` does not pass `_MIN_INSTANCES`, so set it after
deploy:

```bash
for S in model-trellis unirig; do
  gcloud run services update "$S" --region us-central1 --min-instances=1
done
# Revert at expiry: same loop with --min-instances=0
```

### Cost per asset

Full-instance Cloud Run L4 rate (GPU + always-allocated CPU + memory,
`us-central1`, on-demand): **8 vCPU / 32 GiB + L4 ≈ \$1.69/hr**, **4 vCPU / 16 GiB
+ L4 ≈ \$1.20/hr** (L4 GPU ≈ \$0.71/hr; CPU ≈ \$0.0000240/vCPU·s; mem ≈
\$0.0000025/GiB·s). Per asset:

```
$/asset = instance_$per_hr × (warm_seconds_per_asset / 3600)
```

| Service | instance \$/hr | warm s/asset *(estimate)* | \$/asset *(estimate)* |
|---|---|---|---|
| `model-trellis` (image→3D) | 1.69 | ~30–60 | \$0.014–0.028 |
| `model-hunyuan3d` | 1.69 | ~60–120 | \$0.028–0.056 |
| `model-triposg` (sketch) | 1.69 | ~20–40 | \$0.009–0.019 |
| `model-triposr` (fast) | 1.20 | ~5–15 | \$0.002–0.005 |
| `unirig` (rig) | 1.20 | ~20–60 | \$0.007–0.020 |
| `model-text2motion` | 1.20 | ~10–30 | \$0.003–0.010 |

> These s/asset values are **pre-deploy estimates** from each model's profile, not
> measured. Every worker already logs the real figure as `elapsed_ms` on its
> `GET /tasks/{id}` result and in Cloud Logging. Replace the table with measured
> warm + cold latency post-deploy:
> ```bash
> gcloud run services logs read model-trellis --region us-central1 \
>   --format='value(textPayload)' | grep -oE 'done in [0-9.]+s'
> ```
> Prompt 08 uses the measured \$/asset × expected volume for the keep/kill
> decision at credit expiry.

### Raised free-lane ceilings (landed, flag-gated)

The per-principal free ceiling is 60/h to protect the **rate-limited hosted NIM**
allocation. With the fleet primary that allocation is out of the path, so
`FORGE_SELFHOST_PRIMARY=1` raises it (`api/_lib/rate-limit.js` — `FREE_HOURLY_BASE`
feeds `mcp3dGenerateFree` + `mcp3dGenerateFreeTiered`):

- **Default raised ceiling: 240/h** per principal (4×), tunable via
  `FORGE_FREE_HOURLY_SELFHOST`.
- **Math:** credit-window free-image fleet = `trellis_selfhost` (max 2) +
  `hunyuan3d` (max 3) = **5 concurrent L4 slots** at `MAX_CONCURRENT=1`. At a
  blended ~60 s/asset that is `5 × 3600/60 ≈ 300 assets/h` global throughput, so a
  single heavy iterator at 240/h stays under the fleet ceiling while the
  hosted-NIM-era throttle is removed. **Re-tune `FORGE_FREE_HOURLY_SELFHOST` from
  the measured s/asset once the fleet is live.**
- **Untouched — abuse/per-IP gates stay intact regardless of the flag:**
  `mcp3dGenerate` (30/h per-IP paid, fail-closed), `paidDailyPerClient` (60/day),
  and the global paid envelope `FORGE_PAID_GLOBAL_HOURLY`.
- **Revert:** unset `FORGE_SELFHOST_PRIMARY` → back to 60/h.

### Deploy runbook (run once gcloud reauth lands — step 1 above)

```bash
# 0. Generate + set the shared worker bearer key (Cloud Run reads it from the
#    avatar-reconstruction-key secret; deploy-all.sh creates that secret).
#    Set the SAME value in Vercel as GCP_RECONSTRUCTION_KEY (step 4).

# 1. Stage weights into gs://three-ws-model-weights (once; ~80 GB, gcsfuse mode).
cd workers/deploy
HF_TOKEN=hf_xxx SERVICES="hunyuan3d trellis triposr triposg unirig" ./stage-weights.sh

# 2. Check L4 quota FIRST (approval can take days). Need >= 4 concurrent for the
#    warm fleet; deploy what fits now and file an increase for the rest.
gcloud run regions describe us-central1 2>/dev/null   # or Console -> Quotas -> nvidia_l4_gpu_allocation

# 3. Build + deploy the mesh/rig fleet, then text2motion (CPU-path helper script).
PROJECT_ID=aerial-vehicle-466722-p5 \
  SERVICES="hunyuan3d trellis triposr triposg unirig" ./deploy-all.sh
PROJECT_ID=aerial-vehicle-466722-p5 SERVICES="text2motion" ./deploy-editing.sh

# 4. Pin the two hot lanes warm for the credit window (see override above).
for S in model-trellis unirig; do
  gcloud run services update "$S" --region us-central1 --min-instances=1; done

# 5. Health-check each service directly with the bearer key.
KEY=$(gcloud secrets versions access latest --secret=avatar-reconstruction-key)
for S in model-trellis model-hunyuan3d model-triposg model-triposr unirig model-text2motion; do
  U=$(gcloud run services describe "$S" --region us-central1 --format='value(status.url)')
  printf '%s: ' "$S"; curl -fsS -H "authorization: Bearer $KEY" "$U/health" || echo "cold - retry"; echo
done

# 6. Wire Vercel env (PREVIEW first, then production after E2E passes). Use the
#    URLs printed by deploy-all.sh + the key from step 5.
for E in preview production; do
  printf '%s' "$MODEL_TRELLIS_URL"   | vercel env add MODEL_TRELLIS_URL   $E
  printf '%s' "$GCP_HUNYUAN3D_URL"   | vercel env add GCP_HUNYUAN3D_URL   $E
  printf '%s' "$GCP_TRIPOSG_URL"     | vercel env add GCP_TRIPOSG_URL     $E
  printf '%s' "$GCP_RECONSTRUCTION_URL" | vercel env add GCP_RECONSTRUCTION_URL $E
  printf '%s' "$GCP_TEXT2MOTION_URL" | vercel env add GCP_TEXT2MOTION_URL $E
  printf '%s' "$KEY"                 | vercel env add GCP_RECONSTRUCTION_KEY $E
done
# Flip self-host primary + raised ceilings ONLY after E2E on preview is green:
printf '1' | vercel env add FORGE_SELFHOST_PRIMARY preview
```

### E2E verification (definition of done — real outputs, not 200s)

Run against the preview deploy with the URLs set; inspect the actual GLB/clip.

1. **Text→3D free lane** → `trellis_selfhost` → GLB in R2, opens in the viewer.
2. **Image→3D** with a real photo (what hosted NIM rejects) → GLB.
3. **Paid `mesh_forge` chain** (reference image → reconstruction) → GLB, with
   Cloud Logging showing **no Replicate call** (`FORGE_SELFHOST_PRIMARY=1`).
4. **Rig** a generated GLB through UniRig `/rig` → animation-ready GLB; load it and
   confirm the skeleton drives the canonical clips (`src/glb-canonicalize.js`).
5. **text2motion** → one text→motion generation → clip JSON.

Record measured cold + warm latency per path back into *Cost per asset* above, and
raise `FORGE_FREE_HOURLY_SELFHOST` from the measured throughput before flipping the
flag in production.

| Path | cold s | warm s | output verified |
|---|---|---|---|
| text→3D (trellis) | _pending_ | _pending_ | _pending_ |
| image→3D (trellis) | _pending_ | _pending_ | _pending_ |
| mesh_forge (no Replicate) | _pending_ | _pending_ | _pending_ |
| rig (unirig) | _pending_ | _pending_ | _pending_ |
| text2motion | _pending_ | _pending_ | _pending_ |

---

## Spend observability & burn-rate control (prompt 07)

$100k over ~2 months is ~$1,600/day. This section is how we **see** the burn in
real time, **attribute** it to each lane, **alert** before any lane runs away
(especially the GPU fleet and Vertex Claude if flipped to primary), and guard the
opposite failure — credits sitting **unused** at expiry. Everything here is code
that is live and runnable now; the only blocked step is enabling the BigQuery
billing export (one console action) and the same gcloud reauth as the foundation.

### The burn report — `scripts/gcp/burn-report.mjs`

Reads the BigQuery billing export and prints an attributed report: credit
consumed to date, spend by service and by lane label, 7d/30d daily burn, runway,
projected exhaustion vs expiry, and the under-utilization guard.

```bash
node scripts/gcp/burn-report.mjs          # human-readable
node scripts/gcp/burn-report.mjs --json   # machine-readable (dashboard/cron)
```

Exit codes: `0` on-track/idle, `2` runaway (for CI/cron alerting), `3` billing
export not wired, `1` unexpected error. Auth: `GCP_SERVICE_ACCOUNT_JSON` if set,
else the local `gcloud auth print-access-token` (works after `gcloud auth login`).

Config (env or `.env`):

| Env var | Meaning |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | project holding the billing dataset |
| `GCP_BILLING_DATASET` | BigQuery dataset the export writes to (e.g. `billing_export`) |
| `GCP_BILLING_TABLE` | full export table — **or** derive it from ↓ |
| `GCP_BILLING_ACCOUNT_ID` | billing account id; derives `gcp_billing_export_v1_<acct>` |
| `GCP_BILLING_EXPORT_KIND` | `standard` (default) or `resource` (detailed export) |
| `GCP_CREDIT_TOTAL_USD` | grant size, e.g. `100000` — enables runway + projection |
| `GCP_CREDIT_EXPIRY` | ISO date the credits expire — enables the exhaustion-vs-expiry check |
| `GCP_CREDIT_TYPES` | optional override of the credit-type filter (default: `PROMOTION,FREE_TRIAL,COMMITTED_USAGE_DISCOUNT,SUBSCRIPTION_BENEFIT`) |

Shared implementation: `api/_lib/gcp-billing.js` (BigQuery REST + pure projection
math, covered by `tests/gcp-billing.test.js`). The cron and the dashboard import
the same module — one source of truth.

### Enable the BigQuery billing export (owner console action — one time)

The CLI **cannot** enable this; it's console-only.

1. **Billing → Billing export → BigQuery export → Edit settings.**
2. Enable **Standard usage cost** (and optionally **Detailed usage cost** for
   resource-level rows). Pick/create a dataset in `aerial-vehicle-466722-p5`
   (e.g. `billing_export`, location `US`).
3. Data starts flowing within a few hours (no backfill — it's forward-only).
4. Set `GCP_BILLING_DATASET` + `GCP_BILLING_ACCOUNT_ID` (or `GCP_BILLING_TABLE`),
   `GCP_CREDIT_TOTAL_USD=100000`, and `GCP_CREDIT_EXPIRY=<date>` in Vercel (for
   the cron/dashboard) and locally (for the CLI). Verify: `node scripts/gcp/burn-report.mjs`.

### Resource labeling — `scripts/gcp/label-resources.sh`

Attribution only works if every credit-consuming resource carries
`program=gcp-credits` + `lane=<name>`. This discovers the Cloud Run fleet, jobs,
and GCS buckets and (retro-)labels them. Dry-run by default.

```bash
scripts/gcp/label-resources.sh            # dry run — prints the plan
scripts/gcp/label-resources.sh --apply    # write the labels (additive, idempotent)
```

Lanes: `vertex-claude`, `imagen`, `forge-gpu` (the Cloud Run GPU fleet — default
for every discovered service), `vanity`. Vertex Claude + Imagen are API-billed
(no Cloud Run service), so they're attributed by `service.description` in the
report instead of a label. Edit `LANE_OVERRIDES` in the script for exceptions.

### Budgets & alerts — `scripts/gcp/create-budgets.mjs` + the webhook

```bash
node scripts/gcp/create-budgets.mjs           # dry run — prints the plan
node scripts/gcp/create-budgets.mjs --apply   # create/update budgets (idempotent)
```

Creates an **overall program budget** (= `GCP_CREDIT_TOTAL_USD`, default $100k)
with threshold alerts at **25 / 50 / 75 / 90 / 100 %** measured on GROSS spend
(credits excluded, so it tracks grant consumption), plus **per-service** budgets
for Vertex AI / Cloud Run / Compute Engine (sized from `GCP_SERVICE_BUDGETS` or
defaults, service ids resolved live from the billing catalog). All publish to one
Pub/Sub topic (`GCP_BUDGET_PUBSUB_TOPIC`, default `gcp-budget-alerts`).

**Routing to the team:** the topic pushes to `POST /api/webhooks/gcp-budget-alert`,
which turns each threshold crossing into a Telegram ping via `sendOpsAlert` — the
PRIVATE ops chat (`TELEGRAM_ALERTS_CHAT_ID`), **never** the holders' channel.
Deduped per budget+threshold so each crossing pings once/hour.

Wire the push subscription (owner, after `--apply`):

```bash
# 1. shared secret the handler checks (constant-time)
printf '<random-secret>' | vercel env add GCP_BUDGET_WEBHOOK_SECRET production
# 2. let the budgets SA publish to the topic
gcloud pubsub topics add-iam-policy-binding gcp-budget-alerts \
  --project=aerial-vehicle-466722-p5 \
  --member=serviceAccount:billing-budgets.iam.gserviceaccount.com --role=roles/pubsub.publisher
# 3. push subscription → the webhook (secret in the query string)
gcloud pubsub subscriptions create gcp-budget-alerts-push \
  --project=aerial-vehicle-466722-p5 --topic=gcp-budget-alerts \
  --push-endpoint="https://three.ws/api/webhooks/gcp-budget-alert?token=<random-secret>"
```

**Test the alert path** (no live budget needed): publish a synthetic notification —

```bash
gcloud pubsub topics publish gcp-budget-alerts --project=aerial-vehicle-466722-p5 \
  --message='{"budgetDisplayName":"gcp-credits — program","alertThresholdExceeded":0.9,"costAmount":90000,"budgetAmount":100000,"currencyCode":"USD"}'
# → a 🔴 ping lands in the ops chat within seconds.
```

Handler contract (auth 503/401, threshold gate, dedup) is locked by
`tests/api/gcp-budget-alert.test.js`.

### Internal spend dashboard — `/dashboard/spend`

Admin-gated page (dashboard-next → nav "GCP Spend", `src/dashboard-next/pages/spend.js`),
backed by `GET /api/admin/gcp-burn` (session-admin **or** `Bearer $CRON_SECRET`).
Two cross-referenced views:

- **App-side telemetry** (always live, from `usage_events` + `forge_creations`):
  per-lane LLM cost/tokens (14d), Vertex Claude spend estimate (30d + 24h, by
  model), forge generations per backend (self-host flagged), and a daily LLM-cost
  bar chart. This renders even before the billing export is wired.
- **Billing ground truth** (best-effort, from `buildBurnReport`): credit consumed,
  runway, projection vs expiry, credit spend by lane label. Degrades to a designed
  "not wired" panel when the export is absent — the app-side view still shows.

All states designed (loading skeleton, empty, 401/403 lock, error, populated);
auto-refreshes every 60s.

### Kill-switches (verified no-deploy env flips)

The GPU fleet and Vertex Claude are the two runaway risks. Each reverts by env
flag alone — no code deploy:

| Lane | Kill switch | Effect |
|---|---|---|
| Vertex Claude | `vercel env rm VERTEX_CLAUDE_PRIMARY production` | chat falls back to free/BYOK lanes instantly (see prompt 02 section) |
| Forge GPU fleet | `vercel env rm FORGE_SELFHOST_PRIMARY production` | routing stops preferring the self-host GPU workers |
| Imagen | `vercel env add VERTEX_IMAGEN_ENABLED production` = `0` | text→image drops to the free NIM FLUX lane |

**Fast "stop the bleed now" — `scripts/gcp/emergency-stop.sh`** (dry-run by
default): drops **every** Cloud Run service + job to `--min-instances=0`, cancels
in-flight job executions, and prints the flag flips above + the spot/batch stop
commands. Use this for a runaway during the program; use `revert-to-free.sh`
(prompt 08) for the planned end-of-program teardown.

```bash
scripts/gcp/emergency-stop.sh            # dry run — shows what it would do
scripts/gcp/emergency-stop.sh --apply    # drop min-instances to 0 across the fleet
```

### Under-utilization guard + daily cron

The projection flags **`underutilized`** when >30% of the grant is projected to
expire unused (and **`idle`** when there's no burn at all), with per-lane scale-up
prompts (flip `VERTEX_CLAUDE_PRIMARY` for production chat, raise seed-batch
volume, bigger vanity runs). Wasting the credits is a tracked failure mode, not
just overspend.

**`api/cron/gcp-burn-report.js`** runs daily (`0 14 * * *`, registered in
`vercel.json`) and pings the ops channel with the day's status — runaway and
under-utilization get distinct, un-deduped signatures so they always land; an
on-track day posts a quiet one-line status. If the export isn't wired it says so
once/day rather than erroring.

### Current status (2026-07-06)

Burn rate, exhaustion projection, and full/unused-credit tracking are **wired and
tested but not yet reporting real numbers** — they require the BigQuery billing
export (owner console action above) + the same gcloud reauth that blocks the rest
of the foundation. The moment the export lands and `GCP_CREDIT_TOTAL_USD` /
`GCP_CREDIT_EXPIRY` are set, `node scripts/gcp/burn-report.mjs` prints the live
burn rate and days-of-runway, the dashboard fills in, and the daily cron begins
posting. Until then the app-side lane telemetry on `/dashboard/spend` is the live
view. Program budget targets for the alerts: Claude-on-Vertex $40–60k, GPU fleet
$15–25k, Imagen $3–5k, vanity/observability/misc ~$5k.

_Spend-observability section last verified against source: 2026-07-06._
