# Task: Text-to-animation — generate motion from a prompt, retarget onto the user's avatar

## Why this exists

Tripo AI cannot generate animation from a text description. Their animation is
limited to applying preset clips and Mixamo/Tripo retargeting. We already own
every downstream piece — a rigged humanoid skeleton on every avatar, a runtime
retargeting engine, a pose studio with animated-GLB export, and an animation
library. The only missing link is a **motion-diffusion model** that turns a text
prompt ("waving confidently", "a slow tai-chi sweep", "celebratory jump") into a
motion clip we can retarget onto the user's avatar and preview live.

This is our single most defensible feature versus Tripo. Build it completely.

## Rails (CLAUDE.md — non-negotiable; read the full file first)

- **No mocks, no fake data, no placeholders, no fallback sample arrays.** Use a
  real motion-diffusion model running in a real worker. If a credential or model
  weight is missing, find it in `.env` / `vercel env` / the worker's deploy
  config or ask once, then proceed.
- **No TODOs, no stubs, no commented-out code, no `throw new Error("not implemented")`.**
  If you write it, finish it and wire it 100% — worker → API → UI → export.
- **The only coin is `$three`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other coin anywhere.
- **Every state designed** (loading/empty/error/populated); every control has
  hover/active/focus; responsive; accessible; real async indicators.
- **Done = reachable in the browser, exercised end-to-end, `npm test` green,
  `git diff` self-reviewed.** Run the **completionist** subagent before stopping.
- **Push only when the user says so**, then to BOTH remotes (`threeD`, `threews`).

## Explore first (spawn these before writing code)

### Subagent A (Explore) — the worker pattern
> In `/workspaces/three.ws/workers/`, read `model-trellis/`, `model-hunyuan3d/`,
> and `model-triposr/` and document the exact worker contract they share: HTTP
> framework, the `POST /infer` request/response shape, the queued-job model
> (`GET /tasks/:id` polling), how they fetch inputs and upload outputs (GCS/R2),
> how Firestore/job state is tracked, the Dockerfile/deploy layout, and the
> GPU/runtime assumptions. Quote `requirements.txt` / `Dockerfile` / the main
> entry file for one of them verbatim. I am adding a new sibling worker that must
> match this contract exactly.

### Subagent B (Explore) — the retarget + animation surface
> In `/workspaces/three.ws`, read and quote the public API of:
> 1. `src/animation-retarget.js` — the retargeting engine. What skeleton/bone
>    naming does it expect as the *source*? How does it map onto our Wolf3D
>    25-joint humanoid? What is the minimum-coverage rule?
> 2. `src/animation-library.js` — how clips are stored, listed, and applied.
> 3. `src/pose-studio.js` — how it loads a rigged GLB, plays an animation, and
>    exports an animated GLB (the glTF animation-track baking path).
> 4. `api/_mcp/tools/animations.js` — the existing `apply_animation`,
>    `list_animations`, `create_animation_clip` tools.
> 5. The existing `prompts/animation-studio/` prompt set — what was already built
>    vs. planned. Quote `00-README.md`.
> Also report where `/public/animations/` clips live and their format (GLB/FBX),
> and the exact bone names of our target rig (from `workers/unirig/rig_glb.py`).

Wait for both before starting.

## What to build

### Step 1 — the motion-diffusion worker

Create `workers/model-text2motion/` matching the `model-*` worker contract
Subagent A documented (same framework, same `POST /infer` → `GET /tasks/:id`
queued-job shape, same output-upload path).

Model selection — pick a **commercially-licensed** text-to-motion model and state
the license in the worker README. Evaluate, in order of preference:
- **MDM (Motion Diffusion Model)** — MIT, HumanML3D skeleton, well-supported.
- **MoMask** / **T2M-GPT** — higher quality; verify the license is
  commercial-safe before adopting. If the license is non-commercial, do **not**
  use it — fall back to MDM.

Contract:
- `POST /infer { prompt, length_seconds?=4, fps?=30, job_id? }` → `202 { task_id }`
- `GET /tasks/:id` → `{ status, clip_url }` where `clip_url` is a GLB (or BVH)
  carrying the generated motion on the model's native skeleton
  (HumanML3D/SMPL 22-joint).
- Output upload to the same bucket the other workers use.
- Real GPU inference. No canned/sample motion. Sanitize NaN/Inf the way
  `rig_glb.py` does.

Convert the model's native motion output into a clip on a **standard skeleton**
(HumanML3D/SMPL joint names) so the existing retarget engine can map it — do the
SMPL→named-skeleton conversion in the worker, not in the browser.

### Step 2 — the API endpoint

Add a backend endpoint that ties prompt → worker → retarget → user's avatar.
Reuse `api/forge.js`'s job conventions (`?job=<id>` polling, the queued-status
shape) and the existing R2/DB helpers (`api/_lib/r2.js`, `api/_lib/db.js`).
Prefer extending `api/_mcp/tools/animations.js`'s `create_animation_clip` to
accept a `prompt`, plus a thin public route (e.g. `api/animate.js` or a
`path: "text"` branch on the animation API) that:

1. Submits the prompt to the text2motion worker, returns a `job_id`.
2. On completion, retargets the generated clip onto the requesting avatar's rig
   using the engine from `src/animation-retarget.js` (run it server-side in Node
   — Subagent B confirmed it runs in Node as well as the browser).
3. Stores the retargeted animated GLB in R2 under the avatar's namespace and
   records the clip in the animation library so it shows up in the user's list.
4. Returns the clip URL + metadata.

Handle errors at the boundary: bad prompt, worker timeout, a rig the retargeter
can't cover (<50% bone coverage) → a real, actionable error, never a fake clip.

### Step 3 — wire the UI

In the pose/animation studio (`src/pose-studio.js` + its page, and/or the
`prompts/animation-studio/` surface), add a **"Generate from text"** control:

- A prompt input with a length slider and a Generate button.
- Loading state: a real progress indicator tied to the job poll (skeleton/au
  progress, not a fake timer).
- On success: the clip auto-loads onto the avatar in the viewport and plays,
  with the existing scrub/speed/loop controls.
- Save to library (reuses `animation-library.js`) and **Export animated GLB**
  (reuses the pose-studio baking path).
- Empty state explains what to type; error state explains failure + recovery.
- Hover/active/focus on every control; keyboard-operable; responsive at 320 /
  768 / 1440.

### Step 4 — MCP + monetization hooks

- Expose `text_to_animation(avatar_id, prompt, length?)` as an MCP tool
  alongside the existing animation tools in `api/_mcp/tools/animations.js`.
- Respect the existing usage/plan gating pattern (see how
  `api/avatar/video-generate` meters free vs. paid in `usage_events`). Free tier
  gets a small quota; paid is unlimited. No new coin references — billing is in
  the platform's existing units / `$three` only where a token is surfaced.

### Step 5 — deploy config

- Add the worker to whatever deploy manifest the other `model-*` workers use
  (`workers/deploy/` or each worker's own deploy file — match the pattern).
- If the retarget step runs in a Vercel function, confirm its `maxDuration` in
  `vercel.json` is sufficient (retarget is fast; the wait is the worker job,
  which is polled, not held).

### Step 6 — tests

- Unit-test the SMPL→named-skeleton conversion with a tiny synthetic motion
  array (assert joint count, no NaN, monotonic time track).
- Unit-test the retarget call on a fixture rig (reuse any rig fixture the repo
  already has; otherwise build a minimal rigged GLB the way
  `tests/render-glb.test.js` builds its triangle GLB).
- Gate the real-worker GPU path behind an env flag (e.g.
  `RUN_GPU_TESTS=1`) and document the skip, mirroring the headful-render test
  convention in `tests/render-glb.test.js`.
- Endpoint test: stub the worker call at the module boundary, assert the
  endpoint submits the job, retargets, writes R2, records the library row.

### Step 7 — docs

- `workers/model-text2motion/README.md`: model, license, contract, deploy.
- Add a PROGRESS.md item describing what shipped.
- If `prompts/animation-studio/` lists text-to-animation as future work, mark it
  done there.

## Definition of done

- A user types a prompt in the studio and a real, model-generated motion plays on
  their own avatar within the job's normal latency — no canned clips.
- The clip saves to their library and exports as an animated GLB.
- `text_to_animation` works as an MCP tool with plan gating.
- `npm test` green (GPU path skipped in CI, documented).
- The new worker matches the existing `model-*` contract exactly.
- `git diff` self-reviewed; completionist subagent run and its findings fixed.

## Constraints

- Use a real, commercially-licensed motion model. State the license. If unsure,
  use MDM (MIT). Never ship a non-commercial model in production.
- Do the SMPL→skeleton conversion in the worker, not the browser.
- Reuse `src/animation-retarget.js` — do not write a second retargeter.
- No fake/sample motion anywhere, including tests' "happy path."
