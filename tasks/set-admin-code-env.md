# Task: Set ADMIN_CODE in Vercel + Fix World Health Warning

## Context

Every 5 minutes the world-health cron fires and logs:

```
[world-health] degraded — world is UNPROTECTED — ADMIN_CODE is not set; every visitor has build rights
```

`ADMIN_CODE` gates write access to the Hyperfy world at world.three.ws. Without it, any visitor
can build/edit the world — this is a security gap.

> **Root cause (verified 2026-06-21):** the `protected` flag that both health checks read comes
> from **`world.three.ws/status`** — i.e. the **Cloud Run Hyperfy service** — not from any Vercel
> env var. `api/cron/world-health.js` and `api/_lib/forge-health.js` both branch on
> `status.protected === true`; neither reads `process.env.ADMIN_CODE`. **Setting `ADMIN_CODE` in
> Vercel does NOT close the gap and does NOT stop the warning.** The fix is on **Google Cloud**:
> set the admin code on the Cloud Run service so its `/status` reports `protected:true`. Live
> `/status` currently returns `{"protected":false, ...}` — the gap is open.

## What to do

### 1. Authenticate to Google Cloud

The Hyperfy world is Cloud Run service `hyperfy-world` in project `aerial-vehicle-466722-p5`
(region `us-central1`). You need Cloud Run + Secret Manager + Cloud Build access:

```bash
gcloud auth login
gcloud config set project aerial-vehicle-466722-p5
```

### 2. Run the hardening script

[`deploy/world/apply-hardening.sh`](../deploy/world/apply-hardening.sh) is the canonical fix. It
creates the `hyperfy-admin-code` secret (printing the generated code once — store it), grants the
runtime SA `secretAccessor`, rebuilds the image, and `gcloud run services replace`s the service
with `ADMIN_CODE` mounted:

```bash
bash deploy/world/apply-hardening.sh
```

The code is auto-generated inside the script; no need to generate one by hand. In-world, builders
then claim rights with the chat command `/admin <code>`.

### 3. Verify

The script waits for the new revision and curls `/status`. Confirm it prints
`OK — world is protected`. Independently:

```bash
curl -fsS https://world.three.ws/status   # expect "protected":true
```

After the next world-health cron tick (≤15 min) the `[world-health] degraded` warning stops and
the check reports `status: "ok"`.

### (Optional) Vercel `ADMIN_CODE`

Only set `ADMIN_CODE` in Vercel if a Vercel-side feature is later wired to read it — as of
2026-06-21 nothing on the Vercel side does, so this step is not required to fix the gap. If you
do, use the REST API (the CLI `env add` writes empty strings under the plugin wrapper):

```bash
curl -X POST "https://api.vercel.com/v10/projects/prj_IWZmEnqR1pCZRCRuvhCFCDcOx5Wc/env" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" -H "Content-Type: application/json" \
  -d '{"key":"ADMIN_CODE","value":"<CODE>","type":"encrypted","target":["production","preview"]}'
```

## Relevant files

- `api/cron/world-health.js` — the cron that emits the warning (reads `world.three.ws/status`)
- `api/_lib/forge-health.js` — second consumer; also branches on `status.protected`
- `deploy/world/apply-hardening.sh` — sets ADMIN_CODE on the Cloud Run Hyperfy world (the real fix)

## Acceptance criteria

- `https://world.three.ws/status` reports `"protected":true`
- `[world-health] degraded` no longer appears in Vercel logs
- The health check returns `status: "ok"` (or at least no longer mentions ADMIN_CODE)

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/set-admin-code-env.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
