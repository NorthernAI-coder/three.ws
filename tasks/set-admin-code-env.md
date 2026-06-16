# Task: Set ADMIN_CODE in Vercel + Fix World Health Warning

## Context

Every 5 minutes the world-health cron fires and logs:

```
[world-health] degraded — world is UNPROTECTED — ADMIN_CODE is not set; every visitor has build rights
```

`ADMIN_CODE` gates write access to the Hyperfy world at world.three.ws. Without it, any visitor
can build/edit the world — this is a security gap.

## What to do

### 1. Generate a strong code

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Copy the output (something like `Kx9mR2_nP4qT7vL1wJ3sY8eA6dB5cF0i`).

### 2. Set it in Vercel

Use the REST API (the CLI `env add` command writes empty strings under the Vercel plugin wrapper):

```bash
curl -X POST "https://api.vercel.com/v10/projects/prj_IWZmEnqR1pCZRCRuvhCFCDcOx5Wc/env" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "ADMIN_CODE",
    "value": "<YOUR_GENERATED_CODE>",
    "type": "encrypted",
    "target": ["production", "preview"]
  }'
```

Or: Vercel Dashboard → Project (3dagent / prj_IWZmEnqR1pCZRCRuvhCFCDcOx5Wc) → Settings →
Environment Variables → Add → key: `ADMIN_CODE`, value: the generated code, target: Production + Preview → Save.

### 3. Set the same code in the Hyperfy world config

The world at world.three.ws is a Cloud Run deployment. The `ADMIN_CODE` env var needs to be set
there too so Hyperfy enforces it. See `workers/deploy/apply-hardening.sh` and
`world-three.ws-hyperfy.md` in memory for the Cloud Run update procedure.

If Cloud Run access isn't available right now, at minimum setting it in Vercel stops the
warning logs from `/api/cron/world-health`.

### 4. Redeploy

Trigger a Vercel redeploy after saving the env var:
```bash
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"3dagent","gitSource":{"type":"github","repoId":"<REPO_ID>","ref":"main"}}'
```

Or just push an empty commit to trigger the deploy hook.

### 5. Verify

After the deploy, wait for the next world-health cron tick (≤5 minutes) and confirm the
warning log is gone. The health check should report `ok` instead of `degraded`.

## Relevant files

- `api/cron/world-health.js` — the cron that emits the warning
- `workers/deploy/apply-hardening.sh` — sets ADMIN_CODE on the Cloud Run Hyperfy world

## Acceptance criteria

- `[world-health] degraded` no longer appears in Vercel logs
- The health check returns `status: "ok"` (or at least no longer mentions ADMIN_CODE)
