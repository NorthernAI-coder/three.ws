# Probe: Microsoft TRELLIS on NVIDIA NIM (hosted) — verified recipe

**Status:** hosted free tier **works** for text→3D (image→3D shares the same endpoint).
Verified live from this Codespace on **2026-06-11** with the platform `NVIDIA_API_KEY`
(`nvapi-…`) while building T1.1. Produced a real, valid binary glTF.

> This file is the empirical T0.2 deliverable. It was captured during T1.1
> (`api/_providers/nvidia.js`) because T0.2 had not been committed; the provider is
> built directly against the behavior recorded here.

---

## 1. Invoke endpoint + headers

```
POST https://ai.api.nvidia.com/v1/genai/microsoft/trellis
Authorization: Bearer $NVIDIA_API_KEY
Accept: application/json
Content-Type: application/json
```

- Same `nvapi-…` key as the chat lane (`integrate.api.nvidia.com`).
- `Accept: application/json` → the GLB comes back base64 inside a JSON envelope.

## 2. Text→3D request schema

```json
{
  "mode": "text",
  "prompt": "a teapot",
  "ss_sampling_steps": 15,
  "slat_sampling_steps": 15,
  "output_format": "glb"
}
```

- **`prompt`** (NOT `text_prompt`); truncated server-side at **77 chars**.
- **`output_format` MUST be lowercase `"glb"` or `"stl"`.** Sending `"GLB"` returns
  **422** with `{"detail":[{"type":"literal_error","loc":["body","output_format"],
  "msg":"Input should be 'glb' or 'stl'","input":"GLB", ...}]}` — this is the single
  biggest gotcha; the rest of the docs use uppercase prose.
- `ss_sampling_steps` / `slat_sampling_steps` accept **10–50**. Optional: `seed`,
  `ss_cfg_scale`, `slat_cfg_scale`, `no_texture` (bool), `samples` (must be 1).

## 3. Image→3D request schema

```json
{ "mode": "image", "image": "data:image/png;base64,<…>", "ss_sampling_steps": 15, "slat_sampling_steps": 15, "output_format": "glb" }
```

- Field is singular **`image`**, a data URI.
- **Inline limit: 180 KB of RAW image bytes.** Above that, use the NVCF asset handshake:
  1. `POST https://api.nvcf.nvidia.com/v2/nvcf/assets` with `{"contentType":"image/png","description":"trellis-input"}` → `{ assetId, uploadUrl }`.
  2. `PUT {uploadUrl}` with the raw bytes, `Content-Type` matching, header
     `x-amz-meta-nvcf-asset-description: trellis-input` (no auth — the URL is presigned).
  3. Invoke with header `NVCF-INPUT-ASSET-REFERENCES: {assetId}` and body
     `"image": "data:image/png;asset_id,{assetId}"`.

## 4. Response / poll protocol

- **At draft quality (15/15 steps) the invoke returns `200` SYNCHRONOUSLY** (~12–13 s),
  body in hand — no poll round-trip needed. Higher step counts may instead return
  **`202`** with header **`NVCF-REQID`**; poll
  `GET https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/{NVCF-REQID}` (Bearer + Accept
  json) until it flips from `202` (running) to `200` (done). Same body shape on 200.
- Terminal: `200` = done, `202` = still running, `404` = req expired/unknown.
- Rate limit: treat **`429`** as the signal (honor `Retry-After`); no documented
  per-key headers on the free tier.

## 5. Result shape

```json
{ "artifacts": [ { "base64": "<base64 GLB>" } ] }
```

- GLB lives at `response.artifacts[0].base64`. `Buffer.from(b64,'base64')` → a `.glb`
  whose first 4 bytes are `glTF` (version 2).

## 6. Observed latencies / sizes (2026-06-11, draft, "a teapot")

| variant            | steps  | wall-clock | result            |
| ------------------ | ------ | ---------- | ----------------- |
| text→3D (sync 200) | 15/15  | ~12–13 s   | 1.3–1.6 MB GLB ✓  |

Verified 1,625,624-byte GLB (magic `glTF`, version 2) round-tripped through R2 persist
and re-fetched intact.

## 7. Reproduce

```bash
node --input-type=module -e '
import { config as dotenv } from "dotenv";
dotenv({ path: new URL("./.env.local", import.meta.url) });
const res = await fetch("https://ai.api.nvidia.com/v1/genai/microsoft/trellis", {
  method: "POST",
  headers: { authorization: "Bearer " + process.env.NVIDIA_API_KEY, accept: "application/json", "content-type": "application/json" },
  body: JSON.stringify({ mode:"text", prompt:"a teapot", ss_sampling_steps:15, slat_sampling_steps:15, output_format:"glb" }),
});
const d = await res.json();
const buf = Buffer.from(d.artifacts[0].base64, "base64");
console.log(res.status, buf.subarray(0,4).toString("ascii"), buf.byteLength);
'
# → 200 glTF 1297760
```

The provider wrapper (`api/_providers/nvidia.js`) + full persist verification live in
`scripts/verify-nvidia-trellis.mjs`.

---

## Addendum 2026-06-11 (T1.5 prod smoke): image mode is example-gated on the hosted preview

Live findings while smoking the deployed image→3D flow — **the hosted preview API does
not accept user images at all.** Every input form was probed against
`POST https://ai.api.nvidia.com/v1/genai/microsoft/trellis` with a valid key:

| Input form | Result |
|---|---|
| inline base64, 203 KB PNG | 422 `{"detail":"Expected: example_id, got: base64"}` |
| inline base64, 35 KB JPEG | 422 `{"detail":"Expected: example_id, got: base64"}` — size is irrelevant |
| NVCF asset (create → presigned PUT → `data:<ct>;asset_id,<id>` + `NVCF-INPUT-ASSET-REFERENCES`) | 422 `{"detail":"Expected: example_id, got: asset_id"}` |
| `data:<ct>;example_id,<real-asset-uuid>` (with and without the asset header) | 422 `{"detail":"Not valid example_id, expected value 0, 1, 2, 3"}` |
| bare asset uuid in `image` | 422 `{"detail":"Image has been provided in the invalid form"}` |

The official schema (docs.api.nvidia.com/nim/reference/microsoft-trellis-infer) confirms:
*"Preview API NIM supports only a predefined set of images. The image should be in form of
`data:image/png;example_id,{example_id}` with example_id in a range [0,3]."*

**Consequences (shipped same day):**
- `api/_providers/nvidia.js` is text-only; the NVCF asset-handshake code was removed
  (recipe preserved above and in git history — it IS the correct mechanism for
  self-deployed TRELLIS NIMs, which do accept real image input).
- `resolveBackendId({ userImages })` keeps photo submissions off text-only backends;
  explicit photo+nvidia requests get a designed 422 `backend_text_only` at the forge
  boundary; the catalog exposes `user_images` per backend and the /forge UI disables
  text-only engines while reference views are attached.

The NVCF asset upload handshake itself works (asset create + presigned PUT both 200) —
it is the TRELLIS preview function that refuses non-example references.

---

## Addendum 2026-06-16 (artifact-shape drift + hardening verification)

**Symptom.** Prod logs showed the free text→3D seed lane failing every tick with:

```
[nvidia] sync 200 but no GLB artifact — json keys=["artifacts"]
```

i.e. HTTP 200 with `{ "artifacts": [...] }`, but the array item no longer matched the
2026-06-11 `{ base64 }` shape recorded in §5. The hosted NVCF preview had drifted its
artifact envelope. `extractGlbBase64()` was hardened (commits `c8f5615c` CDN-URL +
better diagnostic, `e4eb831c` bare-string artifact, `fbbae6ed` numeric-key object) to
accept the full union of observed shapes and to emit a precise diagnostic on any future
drift:

```
[nvidia] sync 200 but no GLB artifact — json keys=[...] artifact[0]=[...]
```

The accepted shapes are now (any one yields GLB bytes → R2 persist → durable URL):

| shape | example |
|---|---|
| inline base64 (original) | `{ artifacts: [ { base64: "<b64>" } ] }` |
| inline base64 under `data` | `{ artifacts: [ { data: "<b64>" } ] }` |
| bare string in the array | `{ artifacts: [ "<b64>" ] }` |
| URL-based (CDN) | `{ artifacts: [ { url: "https://…/x.glb" } ] }` → fetched + buffered |
| numeric-key object | `{ artifacts: { "0": { base64 | url } } }` |
| raw bytes | `Content-Type: model/gltf-binary` / `octet-stream`, body is the GLB |

**Live verification (2026-06-16, against deployed prod, the 09:19 build carrying
`c8f5615c` + `e4eb831c`):**

1. Direct forge probe — `POST https://three.ws/api/forge`
   `{ prompt: "a small red cube, studio lighting", tier: "draft", path: "image" }`:

   ```json
   { "job_id": null, "status": "done", "backend": "nvidia",
     "creation_id": "d1ad96d7-…", "durable": true, "mode": "text_to_3d",
     "glb_url": "https://three.ws/cdn/forge/…/d1ad96d7-….glb", "eta_seconds": 13 }
   ```
   The persisted GLB fetched back at **3,627,288 bytes**, magic `glTF` (valid binary glTF v2).

2. Autonomous seed cron — prod runtime logs show
   `GET /api/cron/forge-seed-cron → 200` immediately followed by
   `GET /cdn/forge/nvidia/<uuid>.glb → 200` (the `forge/nvidia/<uuid>.glb` key is
   `persistGlb()`'s output) — the per-minute cron is seeding real NVIDIA GLBs. No
   `[nvidia] sync 200 but no GLB artifact` lines remain.

**Note on the upstream raw shape.** The exact current `artifact[0]` keys were *not*
re-confirmed against `ai.api.nvidia.com` directly in this pass: `vercel env pull` returns
`NVIDIA_API_KEY` (and all sensitive vars) **blank** in this environment, so no out-of-band
key was available to hit the upstream endpoint. The lane is nonetheless verified working
end-to-end in prod (above), and the extractor accepts every shape NVIDIA has been seen to
return. To capture the precise raw envelope when a real key is on hand, run §7 below or:

```bash
# requires a real NVIDIA_API_KEY in the environment
node - <<'EOF'
const res = await fetch('https://ai.api.nvidia.com/v1/genai/microsoft/trellis', {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
             accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ mode: 'text', prompt: 'a small red cube, studio lighting',
                         ss_sampling_steps: 10, slat_sampling_steps: 10, output_format: 'glb' }),
  signal: AbortSignal.timeout(60_000),
});
const b = await res.json();
const a0 = b.artifacts?.[0];
console.log('status', res.status, 'top', Object.keys(b),
  'artifact[0]', typeof a0 === 'object' ? Object.keys(a0) : `${typeof a0}:${String(a0).slice(0,40)}`);
EOF
```

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/nvidia-nim/probes/trellis.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
