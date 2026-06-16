# Task: Verify + Harden NVIDIA TRELLIS Artifact Extraction

## Background

Production logs showed the free text→3D lane failing on every forge seed tick with:

```
[nvidia] sync 200 but no GLB artifact — json keys=["artifacts"]
```

This means NVIDIA TRELLIS returned HTTP 200 with `{ "artifacts": [...] }` but the items
didn't match the previously documented shape `{ base64: "..." }`.

A fix was deployed that extends `extractGlbBase64()` in `api/_providers/nvidia.js` to also:
1. Handle URL-based artifacts — if `artifact[0].url` is set, fetch and buffer the CDN file
2. Handle direct string artifacts in the array (without an object wrapper)
3. Emit a better diagnostic: now logs `json keys=[...] artifact[0]=[...]` so the actual
   schema is visible in the first failure after any future NVIDIA API change

The improved diagnostic means if NVIDIA changes the schema again, the next failure log will
show the new artifact[0] keys immediately, making the fix obvious without guessing.

## What to verify after the next deploy

### 1. Check that forge seed is succeeding

After deploying, wait for 2–3 cron ticks (2–3 minutes). In Vercel logs, look for:

```
[forge-seed] new_job: { ok: true, sync: true, glb_url: "https://..." }
```

or

```
[forge-seed] new_job: { ok: true, job_id: "nvcf-..." }
```

Either means the NVIDIA lane is working. If you still see `[nvidia] sync 200 but no GLB
artifact`, the next log line will now include `artifact[0]=[...]` — that tells you exactly
what keys NVIDIA is returning so the extraction can be patched precisely.

### 2. Live probe (if still broken after deploy)

Run a direct test against the NVIDIA endpoint to see the raw response:

```bash
node - <<'EOF'
const key = process.env.NVIDIA_API_KEY;
const res = await fetch('https://ai.api.nvidia.com/v1/genai/microsoft/trellis', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${key}`,
    accept: 'application/json',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    mode: 'text',
    prompt: 'a small red cube, studio lighting',
    ss_sampling_steps: 10,
    slat_sampling_steps: 10,
    output_format: 'glb',
  }),
  signal: AbortSignal.timeout(60_000),
});
console.log('status:', res.status);
console.log('content-type:', res.headers.get('content-type'));
const body = await res.json().catch(() => res.text());
if (typeof body === 'object') {
  console.log('top keys:', Object.keys(body));
  if (Array.isArray(body.artifacts) && body.artifacts.length > 0) {
    const a0 = body.artifacts[0];
    console.log('artifact[0] type:', typeof a0);
    if (typeof a0 === 'object') {
      console.log('artifact[0] keys:', Object.keys(a0));
      // Show value type + first 80 chars of each key
      for (const k of Object.keys(a0)) {
        const v = a0[k];
        console.log(`  ${k}: ${typeof v} ${String(v).slice(0, 80)}`);
      }
    } else {
      console.log('artifact[0] value:', String(a0).slice(0, 80));
    }
  }
} else {
  console.log('body (first 200):', body.slice(0, 200));
}
EOF
```

Run with `NVIDIA_API_KEY=$(vercel env pull --yes /dev/stderr 2>&1 | grep NVIDIA | awk -F= '{print $2}') node ...`
or pull the key from `vercel env pull`.

### 3. Update the protocol comment in `api/_providers/nvidia.js`

The file header (lines 25–37) currently documents the artifact shape as:
```
result  body.artifacts[0].base64  — base64-encoded .glb
```

After confirming what NVIDIA actually returns, update this to reflect the real shape.
For example, if it's now URL-based:
```
result  body.artifacts[0].url  — CDN URL to a .glb; fetched + buffered by extractGlbBase64
```

## Key files

- `api/_providers/nvidia.js` — `extractGlbBase64()` (line ~124), protocol comment (line ~25)
- `api/cron/forge-seed-cron.js` — the cron that exercises this path every 60s
- `tasks/nvidia-nim/probes/trellis.md` — prior probe transcripts; add a new entry with today's findings

## Acceptance criteria

- Vercel logs show at least one `ok: true` forge seed result with a real `glb_url`
- The protocol comment in `nvidia.js` accurately describes the current artifact shape
- `tasks/nvidia-nim/probes/trellis.md` updated with the confirmed schema and date
