# Probe: NVIDIA NIM — FLUX text→image (black-forest-labs)

**Date:** 2026-06-11 · **Task:** T0.3 (Phase 0) · **Key:** `NVIDIA_API_KEY` (`nvapi-…`, redacted below)

**Verdict:** ✅ **Fully invocable on the hosted free tier.** Synchronous JSON, no
202/poll, no NVCF asset handshake. Both `flux.1-schnell` and `flux.1-dev` work. This is a
drop-in free first lane for `api/_mcp3d/text-to-image.js` (T1.3).

---

## Endpoint

```
POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev
```

- **Host is `ai.api.nvidia.com/v1/genai/…`, NOT `integrate.api.nvidia.com`.** The
  `integrate` host (used by the chat/OpenAI-compatible lanes) 404s for these models
  (`/v1/infer/black-forest-labs/flux.1-schnell` → `404 page not found`).
- Auth: `Authorization: Bearer $NVIDIA_API_KEY`
- `Content-Type: application/json`, `Accept: application/json`
- **Response is synchronous** — single request returns the image inline. `nvcf-status:
  fulfilled` header, no poll URL, no `NVCF-POLL-SECONDS`. (Unlike TRELLIS.)

## Request schema

| field       | type   | schnell                       | dev                           | notes |
|-------------|--------|-------------------------------|-------------------------------|-------|
| `prompt`    | string | required                      | required                      | |
| `steps`     | int    | **1–4** (≤4 enforced)         | **≥5** (≥5 enforced)          | schnell is the 4-step distilled model |
| `cfg_scale` | float  | accepted                      | accepted (used 3.5)           | guidance scale |
| `width`     | enum   | one of the size set below     | same                          | |
| `height`    | enum   | one of the size set below     | same                          | |
| `seed`      | int    | accepted, echoed back         | accepted, echoed back         | deterministic |
| `samples`   | int    | **≤1** (1 image per call)     | ≤1                            | no batching |
| `mode`      | string | accepted (`base`)             | —                             | |

**Allowed `width`/`height` values (discrete enum, not free range):**
`768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344`.
Anything else → `422 literal_error`. (e.g. `720`, `2048` rejected.) `1024×1024` is the safe default.

## Response shape

```json
{
  "artifacts": [
    {
      "base64": "/9j/4AAQSkZJRgABAQ…",   // JPEG bytes, base64
      "finishReason": "SUCCESS",
      "seed": 42
    }
  ]
}
```

- Image is **JPEG** (magic `ffd8ffe0`, JFIF), 3-channel RGB, at the requested size.
  Decoded & verified with PIL: `JPEG (1024, 1024) RGB`, ~70 KB for a 1024² schnell image.
- Field is `artifacts[0].base64` (raw base64, no `data:` prefix). `finishReason: SUCCESS`.
- **When persisting to R2 in T1.3, write it as `.jpg`/`image/jpeg`**, not PNG (the Replicate
  FLUX lane returns PNG — don't assume the same content-type).

## Observed latency (Codespace → NVIDIA)

| model           | steps | size      | wall time |
|-----------------|-------|-----------|-----------|
| flux.1-schnell  | 4     | 1024×1024 | ~1.5 s    |
| flux.1-dev      | 50    | 1024×1024 | ~8.0 s    |

schnell is the right pick for the interactive free lane; dev only if a quality tier wants it.

## Rate-limit headers

None observed. Response headers were just `date`, `content-type: application/json`,
`access-control-expose-headers: nvcf-reqid`, `nvcf-reqid: <uuid>`, `nvcf-status: fulfilled`.
No `x-ratelimit-*` / `retry-after` on success. Free tier is credit-metered; expect 429
under load (treat as `rate_limited` in the provider contract — same as TRELLIS).

## Error shapes (for normalized error mapping in T1.3)

- **403** bad/expired key → `{"status":403,"title":"Forbidden","detail":"Authorization failed"}`
  (note: **403**, not 401 → map to `invalid_key`).
- **422** schema violation → `{"detail":[{"type":"…","loc":["body","steps"],"msg":"…","input":…,"ctx":{…}}]}`
  (FastAPI-style validation array → map to `provider_error`, log `detail`).
- Expect **402** insufficient credits / **429** rate-limited under sustained use (not
  reproduced — credits available at probe time).

## Reproduction (key redacted)

```bash
KEY="nvapi-…"   # from .env.local / .env  (NEVER commit the real value)

curl -s https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"prompt":"a red ceramic teapot on a wooden table",
       "width":1024,"height":1024,"steps":4,"seed":42}' \
  | python3 -c "import sys,json,base64;a=json.load(sys.stdin)['artifacts'][0];open('out.jpg','wb').write(base64.b64decode(a['base64']))"
# -> out.jpg : JPEG 1024x1024 RGB, ~70 KB  (deleted after verification)
```

Verified: produced a real `out.jpg`, decodes as valid JPEG 1024×1024 RGB via PIL and
`file(1)`. Scratch files deleted.
