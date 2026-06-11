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
