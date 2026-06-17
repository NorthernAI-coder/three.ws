# Task: "Game-Ready" export tier in Forge — surface the topology pipeline we already built

## Why this exists

Tripo markets clean, game-ready topology (Smart Mesh / smart retopology) as a
flagship differentiator. We already have the hard parts shipped and tested in
`workers/remesh/` — QuadriFlow quad remeshing (MIT, commercial-safe),
silhouette-preserving smart low-poly with UV re-unwrap + texture re-bake, target
face-count decimation, and **FBX export that preserves rigs via headless
Blender**. They are buried behind a raw worker endpoint and never surfaced in the
product. This task wires a one-click **Game-Ready** output into Forge so any
generated or uploaded model can be turned into an engine-ready asset.

This is the cheapest high-visibility win in the set. Do it completely and make it
feel polished.

## Rails (CLAUDE.md — non-negotiable; read the full file first)

- **No mocks, no fake data, no placeholders, no fallback sample arrays.** Real
  remesh worker, real output. If a credential is missing, find it or ask once.
- **No TODOs, no stubs, no commented-out code, no `throw new Error("not implemented")`.**
  Wire 100%: UI → API → worker → result download.
- **The only coin is `$three`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other coin anywhere.
- **Every state designed** (loading/empty/error/populated); hover/active/focus on
  every control; responsive; accessible; real async indicators (skeletons, not
  fake progress bars).
- **Done = reachable, exercised in a real browser, `npm test` green, `git diff`
  self-reviewed.** Run the **completionist** subagent before stopping.
- **Push only when the user says so**, then to BOTH remotes (`threeD`, `threews`).

## Explore first (spawn before writing code)

### Subagent A (Explore) — the remesh worker contract
> In `/workspaces/three.ws/workers/remesh/`, read `main.py` (and any README) and
> quote: the exact `POST /process` request body (`mesh`, `remesh_mode`,
> `operation`, `target_faces`, `texture_size`, `output_format`, anything else),
> the `202 { task_id }` + `GET /tasks/:id` polling shape, the full list of
> supported `output_format` values, the quad-remesh (QuadriFlow) options, the
> smart-lowpoly options, and how FBX export preserves skeleton/skin/blendshapes
> via Blender. State which input formats it fetches by URL.

### Subagent B (Explore) — the Forge surface
> In `/workspaces/three.ws`, quote:
> 1. `api/forge.js` — the job submit/poll contract, and `?catalog` output.
> 2. `api/_lib/forge-tiers.js` — the tier/backend registry shape (how
>    draft/standard/high are defined, ETA + credit cost fields).
> 3. `src/forge.js` + `pages/forge.html` — how results render, where the
>    download / segment / stylize buttons live, and how a post-generation action
>    (like segment) is invoked and polled from the result view.
> 4. `api/forge-segment.js` — the pattern for a "take the generated GLB and run a
>    worker on it" follow-up endpoint. This is the template to copy.
> 5. The R2/DB helpers used by those endpoints (`api/_lib/r2.js`, `api/_lib/db.js`).

Wait for both before starting.

## What to build

### Step 1 — the follow-up endpoint

Create `api/forge-gameready.js` modeled on `api/forge-segment.js` (Subagent B's
template). It takes a generated/uploaded GLB URL plus options and drives the
remesh worker:

- `POST /api/forge-gameready { mesh_url, topology: "quad"|"tri", poly_budget,
  texture_size, formats: ["glb","fbx"] }` → `202 { job_id }`.
- Calls the remesh worker with the right `remesh_mode` / `operation` (quad →
  QuadriFlow; tri → smart-lowpoly decimation), the poly budget as `target_faces`,
  and bakes PBR at the chosen `texture_size`.
- Produces **both** a GLB and (when requested) a rigged FBX via the worker's
  Blender path.
- Uploads results to R2 under the model's namespace; returns the URLs.
- `GET /api/forge-gameready?job=<id>` polls, matching `api/forge.js`'s status
  shape.
- Boundary error handling: worker failure / unreachable mesh / impossible budget
  → a real actionable error, never a silent or faked result.

### Step 2 — register it as a Forge output option

In `api/_lib/forge-tiers.js`, add the Game-Ready output as a first-class,
catalog-visible option (with realistic ETA + cost fields consistent with the
existing tiers) so `GET /api/forge?catalog` advertises it.

### Step 3 — wire the Forge UI

In `src/forge.js` + `pages/forge.html`, add a **"Game-Ready"** action to the
result view, next to the existing Segment / Stylize / Download buttons:

- Opens a small panel: topology toggle (Quad / Tri), a poly-budget slider with
  sensible presets (e.g. 5k / 15k / 50k), texture-size selector (1k/2k), and
  format checkboxes (GLB, FBX).
- Submit → real job poll with a skeleton/progress indicator.
- On success: show before/after poly counts, a live preview of the retopologized
  mesh in the viewport, and download buttons for each format.
- Empty/disabled state explains it needs a generated or loaded model; error state
  explains failure + how to retry with a different budget.
- Hover/active/focus on every control; keyboard-operable; responsive at 320 /
  768 / 1440.

### Step 4 — quality details that make it feel finished

- Show the **poly-count delta** ("28,400 → 5,012 tris, quad-dominant") — this is
  the proof-of-value game devs screenshot.
- Surface a topology wireframe toggle on the preview so users can see the clean
  quads.
- Default the budget to a value appropriate to the model's current size, not a
  fixed number.

### Step 5 — tests

- Endpoint test: stub the worker at the module boundary; assert
  `forge-gameready` submits with the correct `remesh_mode`/`target_faces`,
  polls, writes R2, returns both formats when requested.
- Catalog test: assert the Game-Ready option appears in `?catalog` with valid
  ETA/cost fields.
- If a real worker round-trip test is added, gate it behind an env flag and
  document the skip, mirroring `tests/render-glb.test.js`.

### Step 6 — docs

- Add a PROGRESS.md item.
- Note the new option in any Forge user-facing copy/help.

## Definition of done

- From a Forge result, a user clicks Game-Ready, picks quad + a poly budget, and
  downloads a real retopologized GLB **and** a rigged FBX produced by the remesh
  worker.
- The before/after poly counts and a wireframe preview are shown.
- The option appears in `?catalog`.
- `npm test` green.
- `git diff` self-reviewed; completionist subagent run and findings fixed.

## Constraints

- Reuse `workers/remesh/` — do not write new retopology logic. This task is
  wiring + UI, not research.
- FBX must preserve the rig (the worker's Blender path already does this — pass
  the right flags).
- No placeholder/sample mesh in the result path, including tests' happy path.
- Keep QuadriFlow (MIT) — do not introduce a non-commercial remesher.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/tripo-gap/02-game-ready-export-tier.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
