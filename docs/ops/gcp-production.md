# three.ws production on Google Cloud — operations runbook

**This is the complete operational record of the production platform.** If the
machine that performed the migration is gone, this document + `gcloud` access
to the project is everything needed to operate, deploy, debug, and recover the
site. Written 2026-07-07, the day production moved off Vercel (Vercel disabled
the deployment with `402 DEPLOYMENT_DISABLED`; the site was dark until DNS
cutover to Google Cloud the same day).

Related: [server/README.md](../../server/README.md) (the server code itself),
[STRUCTURE.md](../../STRUCTURE.md) (surface map),
[docs/ops/gcp-model-workers.md](gcp-model-workers.md) (the 3D model workers,
which were already on Cloud Run before this migration).

---

## Architecture

```
Namecheap DNS (three.ws)
  A @   → 136.68.246.178      (global static IP: compute address "three-ws-ip")
  A www → 136.68.246.178
        │
Global External Application Load Balancer (EXTERNAL_MANAGED)
  :80  forwarding rule "three-ws-http"  → target-http-proxy  "three-ws-http-proxy"
        → url-map "three-ws-http-redirect" (301 → https)
  :443 forwarding rule "three-ws-https" → target-https-proxy "three-ws-https-proxy"
        → ssl-certificate "three-ws-cert" (Google-managed, three.ws + www.three.ws,
          auto-renews) → url-map "three-ws-lb"
        → backend-service "three-ws-backend" (Cloud CDN ON, cache mode
          USE_ORIGIN_HEADERS)
        → serverless NEG "three-ws-api-neg" (us-central1)
        │
Cloud Run service "three-ws-api" (us-central1, min 0, 2 vCPU / 2 Gi, timeout 900s,
allow-unauthenticated, runtime SA three-ws@…)
  └─ one Express container (server/index.mjs) serving:
       • static frontend from dist/ (baked into the image)
       • the 1,047-rule vercel.json route table (headers/rewrites/redirects/404)
       • all api/** handlers with Vercel-parity filesystem routing
        │
Data layer (unchanged by the migration — all vendor-neutral HTTP):
  Neon Postgres (DATABASE_URL) · Upstash Redis · Cloudflare R2 (S3_* / R2_*)
Cloud Scheduler: 76 jobs (one per vercel.json cron) → GET /api/cron/* with
  `Authorization: Bearer $CRON_SECRET`
```

- **GCP project:** `aerial-vehicle-466722-p5` (billing account "Sperax",
  `01B467-A61905-9A97D2` — the $100k credits pool; owner-confirmed 2026-07-07).
- **Region:** `us-central1` for everything (same as the model workers).
- **Image:** `us-central1-docker.pkg.dev/aerial-vehicle-466722-p5/cloud-run-source-deploy/three-ws-api:latest`

### Service accounts (IMPORTANT — the project's default compute SA was deleted)

Every build and deploy MUST pin these explicitly or it fails with
"service account does not exist":

- **Build SA:** `three-ws-build@aerial-vehicle-466722-p5.iam.gserviceaccount.com`
  (pass via `--build-service-account` / `serviceAccount:` in cloudbuild.yaml)
- **Runtime SA:** `three-ws@aerial-vehicle-466722-p5.iam.gserviceaccount.com`
  (pass via `--service-account` on every `gcloud run deploy`)

Known gap: the build SA lacks `roles/run.admin` + `iam.serviceAccountUser` on
the runtime SA, so the **deploy step inside `server/cloudbuild.yaml` fails**;
the build+push steps succeed. Until an owner grants those two roles, finish
deploys from a human-authed CLI (command below).

---

## Deploying

```bash
# Frontend changed? Build first — dist/ ships from the local build.
npm run build

# Build image on Cloud Build (32-vCPU + BuildKit layer cache) + push + deploy:
npm run deploy:gcp
```

- Lockfile unchanged → layer cache skips the workspace `npm ci`: **~3–5 min**.
- Lockfile changed → full install: **~12 min**.
- If the pipeline's deploy step fails on IAM (see above), deploy the pushed
  image directly:

```bash
gcloud run deploy three-ws-api \
  --image us-central1-docker.pkg.dev/aerial-vehicle-466722-p5/cloud-run-source-deploy/three-ws-api:latest \
  --project aerial-vehicle-466722-p5 --region us-central1 \
  --allow-unauthenticated --memory 2Gi --cpu 2 --timeout 900 \
  --service-account three-ws@aerial-vehicle-466722-p5.iam.gserviceaccount.com
```

**Rollback (instant):**
```bash
gcloud run revisions list --service three-ws-api --region us-central1 --project aerial-vehicle-466722-p5
gcloud run services update-traffic three-ws-api --region us-central1 \
  --project aerial-vehicle-466722-p5 --to-revisions <good-revision>=100
```

**Logs:**
```bash
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="three-ws-api" severity>=ERROR' \
  --project aerial-vehicle-466722-p5 --freshness=1h --limit 20 --format="value(textPayload)"
```

**Build-context gotcha:** the upload is governed by the **allowlist** in
[.gcloudignore](../../.gcloudignore). If a handler starts reading a directory
at runtime that isn't allowlisted, it will be missing from the image — add the
directory there. `animation-sources/` (2.6 GB) is deliberately excluded; the
few endpoints reading it degrade until it moves to object storage.

**Not yet created:** a Cloud Build GitHub trigger (push-to-deploy like Vercel
had). Requires connecting the `nirholas/three.ws` repo in Cloud Build and
adding the vite build into the Docker build. This is Cloud Build's own GitHub
integration — not GitHub Actions, which this repo does not use.

---

## Crons (Cloud Scheduler)

The 76 schedules in `vercel.json` `crons` are mirrored 1:1 to Cloud Scheduler
jobs in us-central1, named `cron-api-cron-<name>`. All 76 are **ENABLED**
(Vercel's crons died with the deployment, so there is no double-fire risk).

```bash
# Sync after editing crons in vercel.json (idempotent create-or-update):
CRON_SECRET=<value> node scripts/create-gcp-scheduler.mjs --resume

# List / pause / force-run:
gcloud scheduler jobs list --location us-central1 --project aerial-vehicle-466722-p5
gcloud scheduler jobs pause  cron-api-cron-economy-tick --location us-central1 --project aerial-vehicle-466722-p5
gcloud scheduler jobs run    cron-api-cron-uptime-check --location us-central1 --project aerial-vehicle-466722-p5
```

**CRON_SECRET:** was EMPTY on Vercel (every cron guard fail-closed with 503 —
Vercel crons had been silently dead). A real secret was generated 2026-07-07
and set in two places: the Cloud Run service env and every Scheduler job's
Authorization header. **Recover it any time from either place:**

```bash
gcloud scheduler jobs describe cron-api-cron-uptime-check --location us-central1 \
  --project aerial-vehicle-466722-p5 --format="value(httpTarget.headers)"
```

---

## Environment variables

All service env lives on the Cloud Run service (view/edit):

```bash
gcloud run services describe three-ws-api --region us-central1 \
  --project aerial-vehicle-466722-p5 --format=yaml | grep -A2 'name:'
gcloud run services update three-ws-api --region us-central1 \
  --project aerial-vehicle-466722-p5 --update-env-vars KEY=value
```

### ⚠️ THE MIGRATION TRAP — read this before trusting any env export

`vercel env pull` silently returns **EMPTY values for secret-type vars** —
144 of 173 keys pulled blank (only integration-injected vars like
`DATABASE_URL` came through). The plaintexts are not retrievable from Vercel
by CLI at all. Consequences and current state:

1. The initial 157-var application contained mostly empty strings.
2. The `S3_*` group + real values for ~90 keys were recovered from the owner's
   own env archives (owner-provided dump, 2026-07-07) and staged as an 89-var
   validated set (deduped, other-project keys pruned, JWKS verified). **If the
   staging machine is lost before application, the set must be rebuilt from
   the owner's archives** — the sources are the owner's saved env dumps; the
   selection rules are: skip `VERCEL*`/`NX_*`/`TURBO_*`/`PG*`/`POSTGRES_*`/
   `NEON_*`/`DATABASE_URL*`/`REDIS_URL`, skip keys not referenced by this
   codebase, last-occurrence-wins on duplicates.
3. Verify state empirically, not from dashboards: an endpoint returning
   `503 {"error":"not_configured"}` means a `Missing required env var: X`
   line in the logs names the exact var.

### Known-missing (blocked on owner)

| What | Vars | Impact | Recovery |
|---|---|---|---|
| x402 ring signers | `X402_TREASURY_SECRET_BASE58`, `X402_FEE_PAYER_SECRET_BASE58`, `X402_SEED_SOLANA_SECRET_BASE58` | Ring is enabled but cannot sign — no autonomous USDC movement | Owner's gitignored `.x402-ring-secrets.json`, written by `scripts/x402-ring-setup.mjs` on whatever machine ran it. Public halves: fee payer `2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4`, treasury/pay-to `wwwwwDxFWRn7grgr3Esrsg5C6NvDoDHSA4gaCffccrU`. These wallets custody funds — do NOT regenerate. |
| Rate-limiter Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Money-moving limiters **fail closed** (already true on Vercel pre-shutdown) | Owner's Upstash console, or provision fresh Upstash/Memorystore and set both vars. `X402_ALLOW_MEMORY_FALLBACK=1` exists as an explicit single-instance escape hatch. |

---

## DNS / TLS / CDN

- Registrar + DNS: **Namecheap** (nameservers `registrar-servers.com`).
  Web records: `A @ → 136.68.246.178`, `A www → 136.68.246.178`. Everything
  else there (privy/world CNAMEs, TXT/DKIM) is mail/verification — untouched
  by the migration.
- TLS: Google-managed cert `three-ws-cert` (three.ws, www.three.ws) — went
  ACTIVE 2026-07-07 ~18:40 UTC, auto-renews. Status:
  `gcloud compute ssl-certificates describe three-ws-cert --global --project aerial-vehicle-466722-p5`
- CDN: Cloud CDN on `three-ws-backend`, `USE_ORIGIN_HEADERS` — the vercel.json
  asset rule (7-day cache on glb/png/woff2/…) is what the CDN honors.
- The Cloud Run URL `https://three-ws-api-lp642k3kpa-uc.a.run.app` serves the
  identical site and bypasses the LB — useful for isolating LB vs service
  issues.

---

## Verifying after any change

```bash
B=https://three.ws
for p in / /3d /changelog /api/healthz /api/feed /api/explore?limit=4; do
  curl -s -m 25 -o /dev/null -w "%{http_code}  $p\n" "$B$p"; done
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" http://three.ws/   # expect 301 → https
```

`/api/healthz` is designed to stay green through dependency outages — read its
JSON body (x402 block, monitor block) for subsystem truth.

---

## What Vercel still holds (decommission checklist)

- The project + its env vars (plaintexts unreadable, but delete only after the
  ring secrets question is settled — the dashboard may still be useful to a
  human with owner access).
- `@vercel/og` remains a code dependency (runs fine on Cloud Run — plain Node).
- `vercel.json` is now a **live config file consumed by server/index.mjs**
  (routes + crons) — do NOT delete it as "Vercel leftovers".
- The `deploy` npm script still points at Vercel; superseded by `deploy:gcp`.
