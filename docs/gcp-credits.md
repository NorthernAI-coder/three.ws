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
