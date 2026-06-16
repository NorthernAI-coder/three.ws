# Task: Rotate Replicate API Token + Restore Backup Forge Lane

## Context

The production forge pipeline has two lanes for text→3D:
- **Primary**: NVIDIA NIM (free TRELLIS) — default for draft + standard tiers
- **Backup**: Replicate TRELLIS — fallback when NVIDIA fails; also used for high tier + image uploads

The primary lane is now working. The backup lane (Replicate) has been 429ing on every request
for days — the account is over-quota or the token is revoked. This is fine while NVIDIA is up,
but if NVIDIA has any outage the entire forge pipeline goes dark.

Vercel log evidence (repeated hundreds of times):
```
[forge] paid TRELLIS lane unavailable (429); degrading text→3D to free NVIDIA NIM
```

## What to do

### 1. Check the Replicate account status

Go to https://replicate.com/account/billing and look for:
- Spend limit exceeded
- Token invalid / revoked
- Rate limiting (separate from quota)

### 2. Rotate the API token

In the Replicate dashboard:
- Go to https://replicate.com/account/api-tokens
- Revoke the existing token (or just create a new one — both work)
- Copy the new token (starts with `r8_...`)

Set it in Vercel:
```bash
# Use the Vercel REST API (CLI `env add` writes empty values under the plugin wrapper):
curl -X POST "https://api.vercel.com/v10/projects/prj_IWZmEnqR1pCZRCRuvhCFCDcOx5Wc/env" \
  -H "Authorization: Bearer <VERCEL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "REPLICATE_API_TOKEN",
    "value": "r8_NEW_TOKEN_HERE",
    "type": "encrypted",
    "target": ["production", "preview"]
  }'
```

Or via the Vercel dashboard: Project Settings → Environment Variables → find `REPLICATE_API_TOKEN` → Edit → paste new value → Save.

Then redeploy (or trigger via push) so the function picks up the new env.

### 3. Raise the spend limit if needed

If Replicate shows a spend limit was hit, raise it in the billing settings. The forge pipeline
uses Replicate for image→3D (TRELLIS reconstruction) and as a fallback for text→3D. Typical
usage is $0.03–0.10 per generation; set a limit of at least $50/month.

### 4. Verify the backup lane works

After the new token is in Vercel and a redeploy has happened, test the Replicate lane directly:

```bash
curl -X POST https://three.ws/api/forge \
  -H "content-type: application/json" \
  -d '{"prompt":"a red ceramic teapot","tier":"high","backend":"trellis"}'
```

A `backend:"trellis"` in the response (not `backend:"nvidia"`) confirms Replicate is live.
`status:"queued"` with a `job_id` is success — Replicate is async so you'd then poll:

```bash
curl "https://three.ws/api/forge?job=<job_id>"
```

### 5. Test image→3D (Replicate is the only free option here)

```bash
curl -X POST https://three.ws/api/forge \
  -H "content-type: application/json" \
  -d '{"image_urls":["https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png"],"skip_validation":true}'
```

Should return `backend:"trellis"` (or `hunyuan3d` if `GCP_HUNYUAN3D_URL` is set). A 429 here
means Replicate is still broken.

## Relevant files

- `api/_providers/replicate.js` — the Replicate provider
- `api/_lib/forge-tiers.js` — tier routing; `trellis` is the `DEFAULT_BACKEND_FOR_PATH.image`
  and the fallback when NVIDIA fails

## Acceptance criteria

- `curl -X POST https://three.ws/api/forge -d '{"prompt":"test","backend":"trellis"}'` returns 200 with `backend:"trellis"` and a `job_id`
- Vercel logs no longer show `paid TRELLIS lane unavailable (429)` for requests that explicitly use `backend:"trellis"`
- Image→3D submissions (`image_urls`) queue successfully
