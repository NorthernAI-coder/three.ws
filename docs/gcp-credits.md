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
| Billing account | _pending_ |
| Credits applied | _pending_ |
| Remaining balance | _pending_ |
| Expiry date | _pending_ |
| Covers Anthropic partner models? | _pending (see console check above)_ |

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
| aiplatform.googleapis.com | _pending_ |
| run.googleapis.com | _pending_ |
| cloudbuild.googleapis.com | _pending_ |
| storage.googleapis.com | _pending_ |
| compute.googleapis.com | _pending_ |
| bigquery.googleapis.com | _pending_ |
| cloudbilling.googleapis.com | _pending_ |
| monitoring.googleapis.com | _pending_ |

---

## Service accounts

### Inventory

| SA | Purpose | Roles | Status |
|---|---|---|---|
| `avatar-reconstruction-sa@aerial-vehicle-466722-p5.iam.gserviceaccount.com` | Cloud Run workers (mesh/rig pipeline), used by `workers/deploy/*.sh` + cloudbuild | run/build identity | Pre-existing — confirm still valid |
| `vercel-inference@aerial-vehicle-466722-p5.iam.gserviceaccount.com` | Vercel functions → Vertex Claude + Imagen | `roles/aiplatform.user` | **To create** (below) |

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

### Verification status (blocked on the same creds as the rest of this runbook)

Static verification is **done**: model IDs checked against live Vertex docs; both
request/response shapes and the gate + fallback are covered by unit tests
(`tests/api/vertex-imagen.test.js`, `tests/api/text-to-image.test.js` — green).

Live E2E ("prove the pixels") is **blocked**: no GCP creds are present (Vercel has
no `GOOGLE_CLOUD_PROJECT`; local `gcloud` needs interactive reauth; `aiplatform`
is not yet enabled on the project — see **Pending human actions**). Run this once
creds land, to satisfy the quality gate before any production enablement:

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

1. **Restore gcloud auth** (unblocks everything below). This environment's
   `gcloud` fails with *"Reauthentication failed. cannot prompt during
   non-interactive execution"* — the org enforces a session-control reauth
   interval. Owner runs, interactively:
   ```bash
   gcloud auth login                      # re-consent the project owner's Google account
   gcloud auth application-default login   # for Claude Code dev sessions
   gcloud config set project aerial-vehicle-466722-p5
   ```
2. **Confirm credits + partner-model coverage** — console Credits page; answer
   the coverage question (see that section). This is the GO/NO-GO for prompt 02.
3. **Enable Claude in Model Garden** — console, accept Anthropic terms, enable
   the five model IDs listed above.
4. **Run the live setup block** — after step 1, an agent (or the owner) runs the
   API-enable, SA-create, key-mint, Vercel-env, and quota commands above; they
   are all non-interactive once auth works.
5. **Install + auth the Vercel CLI** (`npm i -g vercel && vercel login`) so
   `GCP_SERVICE_ACCOUNT_JSON` + the three location vars can be pushed and
   verified with `vercel env ls`.
6. **Run the smoke test** — `node scripts/gcp/vertex-smoke.mjs`. A green PASS
   closes out this prompt's acceptance criteria.

Update the _pending_ cells in this file as each step completes.
