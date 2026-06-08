# model-text2motion

Text → animation. A GPU Cloud Run worker that samples a motion-diffusion model
from a natural-language prompt and returns a **retargetable three.js
AnimationClip JSON** on the canonical Wolf3D skeleton — the same format the
curated animation library serves, so a generated motion retargets onto any
rigged avatar with the existing engine (`src/animation-retarget.js`), identical
to a preset.

This is the capability Tripo (and the rest of the field) lacks: it generates
motion that does not pre-exist, rather than only applying preset clips.

## Model

[MDM — Motion Diffusion Model](https://github.com/GuyTevet/motion-diffusion-model)
(GuyTevet), **MIT-licensed** → commercial-safe. Chosen over MoMask / T2M-GPT
specifically for the unambiguous commercial license. Swapping models touches only
`mdm_sampler.py`; the contract and the SMPL→clip conversion are model-agnostic.

## Contract

Identical shape to the other `model-*` workers:

```
POST /infer   { prompt, duration_seconds?=4, fps?=30, job_id? } → 202 { task_id, status }
GET  /tasks/:id → { task_id, status, result_url?, frames?, fps?, error? }
GET  /health    → { ok, model_loaded }
```

`result_url` is a three.js `AnimationClip.toJSON()` document in GCS. The platform
reaches this worker through the GCP provider's `text2motion` mode
(`GCP_TEXT2MOTION_URL`), exposed as:

- REST: `POST /api/forge-motion` (+ `GET /api/forge-motion?job=<id>`)
- MCP: `text_to_animation` (generates + retargets onto a model_url in one call)

## Pipeline

1. `mdm_sampler.MdmSampler.sample(prompt, n_frames)` → SMPL motion: local joint
   rotations `(T,24,3)` axis-angle + root translation `(T,3)`.
2. `smpl_to_clip.smpl_motion_to_clip(poses, trans, fps)` → AnimationClip JSON with
   canonical Wolf3D bone names (`Hips.quaternion`, …) + `Hips.position`.
3. Upload JSON to `gs://$GCS_BUCKET/motion-clips/mdm/<task_id>.json`; return the URL.

## What is tested vs deploy-validated

- **Tested here** (`test_smpl_to_clip.py`, 16 cases, pure NumPy): axis-angle →
  quaternion correctness + unit-norm, the SMPL→Wolf3D bone mapping, clip JSON
  shape (track names, value lengths, monotonic times, duration), rest-offset
  calibration, flattened-pose input, single-frame/static, and input validation.
  The JS provider mode + REST endpoint are covered by `tests/api/forge-motion.test.js`.
- **Deploy-validated** (needs the GPU image + checkpoint): the MDM inference in
  `mdm_sampler.py`. In particular, `_decode_to_smpl()` — recovering SMPL
  axis-angle from the HumanML3D feature representation — is the integration point
  to confirm against the deployed checkpoint's representation (positions vs
  rotation output). The SMPL→Wolf3D **rest-pose offset** (`rest_offsets` in
  `smpl_to_clip`) defaults to identity and should be calibrated against the
  Wolf3D rig on first deploy for best fidelity; the retarget engine already
  aligns bone names and hip scale.

## Build / deploy

```bash
gcloud builds submit --config workers/model-text2motion/cloudbuild.yaml .
```

Mounts MDM checkpoints + SMPL body models from the weights bucket at
`MOTION_MODEL_DIR=/weights/mdm`. L4 GPU, 4 CPU / 16Gi, max 2 instances — same
shape as `model-triposr`. Set `GCP_TEXT2MOTION_URL` (+ the shared
`GCP_RECONSTRUCTION_KEY`) on the web deployment to light up the REST + MCP paths.
