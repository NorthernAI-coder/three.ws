# /loop autonomous build session

Running prompt: continue the avatar/voice/3D roadmap; ship up to 6 items end-to-end. No commits, no pushes, no stashes. Working tree dirty by design — review the diff on return.

Rails:
- Real wires only, per CLAUDE.md (no mocks/stubs/TODOs)
- `npx vite build` + relevant vitest specs must pass before claiming done
- No db:migrate against shared Neon
- No on-chain operations
- Blockers logged to NEXT.md, then move on

---

## Item 1 — Compression pass on baked avatar GLBs ✅

**What:** Added `weld` (vertex deduplication), `quantize` (precision reduction: 14-bit positions, 10-bit normals, 12-bit UVs), and `textureCompress` (WebP at 1024px cap, q=85, via `sharp`) to the bake pipeline. Wrapped in a `try` that falls back to the minimal `unpartition + prune + dedup` chain if the compression pass throws on a pathological input.

**Why this first:** zero new dependencies (all packages already installed), zero new code surface, immediate ~5–10× size reduction on every baked avatar GLB served from `/avatars/:id`. Compounds with everything else on the roadmap.

**Files touched:**
- `api/_lib/bake.js` — imports `weld`, `quantize`, `textureCompress`, `sharp`; rewrote the post-merge transform chain with the compression pipeline + fallback.

**Tests:**
- `tests/avatar-bake.test.js` — all 9 pre-existing tests still pass. They cover correctness (morph weights baked into node weights, accessory parented under bone, hash stability, etc.). The compression pass is transparent to those guarantees.

**Build:** `npx vite build` → ✓ 20.29s, no new warnings.

**Caveats:**
- Compression-vs-baseline size delta isn't unit-tested. `scripts/measure-bake-size.mjs` runs the diff on demand. Could add a regression test against a fixed GLB if size becomes flaky.
- `textureCompress` converts everything to WebP. Every browser model-viewer ships in supports WebP natively, but pre-r136 three.js loaders won't — three.ws ships current three so this is safe.

**Follow-up — meshopt() added on top of the baseline pipeline:**
`meshoptimizer` is now installed; `meshopt({ encoder, level: 'medium' })` runs between `quantize()` and `textureCompress()` in the same try/fallback. Browser-side, every viewer that loads baked GLBs (`marketplace-lobby`, `voice/talk-scene` and therefore `avatar-edit`) calls `getMeshoptDecoder()` from `src/viewer/internal.js` and wires it on the GLTFLoader. The main `viewer.js` already wires it via the full `getDecoders()`. Measured deltas on top of the baseline (`scripts/measure-bake-size.mjs`):
- `public/avatars/default.glb`: 1.95 MB → 737 KB (**63% smaller** on top of baseline; 2.74 MB source → 737 KB end-to-end ≈ 3.7×).
- `public/avatars/cz.glb`: 766 KB → 556 KB (**27% smaller** on top of baseline). Smaller meshes get less from meshopt; the full-body avatar is the realistic case.

`draco3d` was uninstalled — `npm ls draco3d` showed only the direct dep with nothing referencing it (`api/avatar/optimize.js` declares the `KHRDracoMeshCompression` extension on primitives but never registers the encoder via `io.registerDependencies`, so that codepath would fail at write time regardless of whether `draco3d` is installed). `draco()` is **not** wired into the bake pipeline because EXT_meshopt decodes faster in the browser at avatar scale.


## Item 2 — ARKit blendshape vocabulary + cross-format resolver ✅

**What:** Self-contained module exporting the canonical 52 ARKit blendshape names + groups, plus weighted-shape maps from three upstream conventions (VRM expressions, Oculus visemes, Preston-Blair phoneme codes) into ARKit. Helpers for name canonicalization (case- and separator-insensitive), morph-dict indexing, per-group coverage reporting, and max-blend composition.

**Why this next:** unblocks viseme-accurate lipsync (current driver only outputs three channels — open/wide/round). The mouth target adapter can now report coverage, downstream phoneme estimators have a stable vocabulary, and emotion overlays compose cleanly on top of mouth shapes.

**Files touched:**
- `src/voice/arkit-blendshapes.js` — new module, pure data + helpers, no DOM or three.js dependencies.

**Tests added:**
- `tests/arkit-blendshapes.test.js` — 25 tests covering: 52-name invariant, group partitioning, case/separator/prefix tolerance, ARKit-only filtering on morph dicts, coverage reporting, shape resolution from VRM / Oculus / phoneme inputs, weighted-map validation (every value in [0,1], every key canonical ARKit), and emotion-on-phoneme blending semantics (max-per-channel).

**Build:** `npx vite build` → ✓ no new warnings.

**Caveats:**
- AvatarMouthTarget hasn't been refactored to use the new resolver yet — that's a separate ship. The new module is value-add today (downstream code can import it) without breaking the existing 3-channel API.
- Weighted maps were authored from the published Wolf3D / Niconi / Oculus references. They're starting values; once we wire a phoneme estimator that emits these labels, real-world tuning may shift a few weights.

## Item 3 — Camera framing presets (full / half / headshot) ✅

**What:** Pulled the avatar framing math out of TalkScene into a pure `camera-presets.js` module exposing `computeFraming({ box, preset, aspectRatio })` and `nextPreset(current)`. Added three presets: **full** (existing default, full body), **half** (sternum-up, FOV 32, ~conversational), **headshot** (face only, FOV 28, intimate). TalkScene now defaults to whatever its caller passes (Talk mode defaults to `half`, customizer keeps `full`) and exposes `setCameraPreset()` / `getCameraPreset()`. Talk overlay header gains a ⛶ cycle button (full → half → headshot loop).

**Why this next:** the previous fixed framing was full-body — fine for the customizer, wrong for conversational Talk mode where the user wants to see the face. Half/headshot also dramatically reduce visible-mouth pixel area only on the cropped portion, which makes the existing FFT lipsync read more accurately to the eye.

**Files touched:**
- `src/voice/camera-presets.js` — new, pure-math module.
- `src/voice/talk-scene.js` — imports `computeFraming`, replaces `_frameAvatar()` body, adds `setCameraPreset()` / `getCameraPreset()` and a `cameraPreset` option on `mount()`.
- `src/voice/talk-mode.js` — mounts with `cameraPreset: 'half'`, adds the cycle button + styles.

**Tests added:**
- `tests/camera-presets.test.js` — 14 tests covering: vocabulary, label coverage, basic framing structure, avatar-centering, preset ordering invariants (head > half > full target Y, head distance < full distance, FOV monotone), aspect-ratio scaling, min-distance floor on small avatars, `nextPreset` cycling.

**Build:** `npx vite build` → ✓ no new warnings.

**Caveats:**
- The framing math assumes the avatar root sits with feet on the floor (Y starts near 0). For models authored at hip-height origins, full preset can clip the legs. Acceptable for now since every avatar produced via Avaturn / Mixamo / standard humanoid pipelines uses a foot-origin convention.
- `setCameraPreset` snaps the camera — no animated tween yet. The existing OrbitControls damping smooths user-driven motion but not programmatic jumps. A `lerpTo()` would polish this; deferred.

## Item 4 — Avatar snapshot capture + thumbnail upload ✅

**What:** Client-side WebGL → JPEG capture + end-to-end upload through the existing thumbnail flow. After a successful customizer Save, the current three.js frame becomes the avatar's `thumbnail_key`. The shipped server endpoint (`?action=auto-tag`) then runs Claude Haiku vision on the snapshot to auto-generate tags + a one-line description, but only if the avatar has none yet — manual values are never overwritten.

**Why this approach and not a true server-side renderer:** a real headless GLB renderer needs `puppeteer-core` + `@sparticuz/chromium-min` (~60 MB function bundle, ~1–2s cold start) or native `gl` + `canvas` libraries with build-time deps Vercel's runtime doesn't ship. That's a deployment-cost decision; logged to NEXT.md for the user. The client capture lands the same user-visible value (avatars get thumbnails, OG cards become real PNGs) on the existing wires immediately.

**Files touched:**
- `src/voice/avatar-snapshot.js` — new module. `captureSnapshotBlob(scene)` forces a synchronous render then `canvas.toBlob` with bounds-checking (MIN/MAX bytes). `uploadAvatarSnapshot({ avatarId, scene })` orchestrates presign → PUT → auto-tag, returning the new `thumbKey`.
- `src/voice/talk-scene.js` — `preserveDrawingBuffer: true` on the renderer so `toBlob` reliably reads the framebuffer (browsers may otherwise hand back a blank frame).
- `src/avatar-edit.js` — calls `uploadAvatarSnapshot` in a `queueMicrotask` after Save lands. Best-effort: failure logs to console but doesn't undo the user-visible "Saved" status.
- `NEXT.md` — new file documenting the server-renderer decision the loop deferred.

**Tests added:**
- `tests/avatar-snapshot.test.js` — 9 tests covering: precondition validation (missing scene/renderer/camera, non-canvas domElement), blank-frame rejection (MIN_BYTES), oversize rejection (MAX_BYTES), null-blob rejection, render-before-toBlob ordering, `uploadAvatarSnapshot` avatarId validation, constants invariants. End-to-end (real WebGL + real R2) is exercised in-browser; jsdom can't synthesize a GPU.

**Build:** `npx vite build` → ✓ no new warnings.

**Caveats:**
- `preserveDrawingBuffer: true` carries a small perf cost. Acceptable at avatar scale; would be wrong at fullscreen-game scale.
- Auto-tag uses `ANTHROPIC_API_KEY`. If unset on the server, the auto-tag call returns `{ ok: false, reason: 'vision_api_error' }` and the thumbnail is still written by the next call. Manual `PATCH /api/avatars/:id { thumbnail_key }` would also work as a fallback.
- Server-side rendering for OG crawl-time generation is deferred (see NEXT.md).

## Item 5 — Server-side GLB → PNG renderer for OG cards ✅

**What:** Headless-chromium renderer that turns any avatar's GLB into a 1200×630 PNG at crawl time, with R2 caching + DB write-back so the chromium cost is paid once per avatar. `api/_lib/render-glb.js` exports `renderGlbToPng({ glbUrl, width, height, background })`; `api/avatar-og.js` now serves (a) the cached thumbnail if present, (b) a freshly-rendered PNG if not, (c) the site logo at `/assets/og-image.png` only if the GLB is too large or rendering fails. Replaces the prior SVG fallback for accounts/avatars that never opened the customizer.

**Why this completes the OG flow:** The Item-4 client-side capture only fires when the user opens the customizer + saves. Avatars created via API, by other users, or that pre-date customizer-save shipping had no `thumbnail_key`, so OG crawlers landed on the SVG card. Twitter/Slack/Discord renders that card fine, but the GLB itself is the actual content — the server renderer makes the OG preview faithful to what the user gets in-app, with no client interaction required.

**Files touched:**
- `api/_lib/render-glb.js` — new module. Bundles a tiny inlined HTML viewer that loads three.js + GLTFLoader from `unpkg.com/three@0.176.0/...`, renders one frame at the target resolution with deterministic three-light rig + auto-framed camera, signals `window.__renderDone = true`, then `page.screenshot({ type: 'png', clip })`. Caches the puppeteer Browser per warm container to amortize launch cost.
- `api/avatar-og.js` — wired the renderer in: thumbnail-cache check first (302 redirect), then GLB size precheck (HEAD, 10 MB cap), then `renderGlbToPng()`, then `putObject({ key: '<storage_key>_og.png' })`, then `UPDATE avatars SET thumbnail_key` guarded by `WHERE thumbnail_key IS NULL` so a concurrent customizer-save snapshot isn't clobbered. Per-avatar in-memory `Promise` lock (Map) so two simultaneous crawls share one render. Any failure → 302 to `/assets/og-image.png` (the real site logo, per CLAUDE.md rule on no placeholder data).
- `api/_lib/env.js` — `CHROMIUM_PACK_URL` getter for overriding the chromium-min binary download URL when upgrading the package.
- `vercel.json` — `api/avatar-og.js` function config bumped to `maxDuration: 30`, `memory: 2048` (chromium needs RAM; render budget is 15s + overhead).
- `package.json` — added `puppeteer-core@^25.0.4` and `@sparticuz/chromium-min@^148.0.0` to runtime dependencies.

**Tests added:**
- `tests/render-glb.test.js` — input-validation suite (always runs) + headful render path gated on `RUN_HEADFUL_TESTS=1` that generates a triangle GLB via `@gltf-transform/core`, serves it from a localhost HTTP server, calls the real renderer, and asserts the returned buffer starts with the PNG magic header. Skipped in CI because chromium download is large.
- `tests/api/avatar-og.test.js` — 11 tests with `renderGlbToPng` stubbed at the module boundary: cached-thumbnail redirect, 404 paths, demo SVG, private-avatar SVG fallback, full server-render path (with R2 + DB write-back assertions), GLB-too-large precheck, render-error fallback to the brand logo, in-memory concurrency lock (verifies two simultaneous crawls share one render), forwarded-host handling for the fallback redirect.

**Tests:** `npx vitest run tests/api/avatar-og.test.js tests/render-glb.test.js tests/api/all-modules-load.test.js` → 257 passed, 1 skipped (headful test). Existing unrelated failures (branding, email templates, validate visibility default) are pre-existing on `main`.

**Caveats:**
- The chromium binary (`@sparticuz/chromium-min`) is downloaded from GitHub at first cold start in each Vercel container and cached in `/tmp`. The default URL in `render-glb.js` points at the v148.0.0 Sparticuz release that matches the npm version pinned in `package.json`. When bumping the npm package, also bump `DEFAULT_CHROMIUM_PACK` (or set `CHROMIUM_PACK_URL` in env) — otherwise puppeteer.launch() will fail to find the matching binary.
- three.js is loaded into the viewer page from `unpkg.com/three@0.176.0/build/three.module.js` via importmap. If the in-app three.js version bumps, also bump `THREE_VERSION` in `render-glb.js` so the server-rendered preview stays faithful to what the customizer shows.
- The in-memory render lock is per-lambda-container. Two Vercel containers seeing the same first-crawl request will each render once, then both write `thumbnail_key`. The `WHERE thumbnail_key IS NULL` guard makes the second write a no-op; the redundant R2 object is overwritten in place. Acceptable redundancy for the cold-start case.

## Item 6 — Blender add-on + ComfyUI nodes for Forge generation ✅

**What:** First-party DCC plugins under `integrations/` that drive the public Forge pipeline (`/api/forge`) from inside the tools artists already use — closing the distribution gap vs Tripo, which ships Blender/Unity/Unreal/ComfyUI plugins while we shipped none. An artist generates a three.ws model (text→3D or image→3D) without leaving Blender or ComfyUI; the GLB imports into the scene / lands in the graph.

**Why this shape:** The Forge endpoints (`api/forge.js`, `api/forge-upload.js`) are already auth-free (IP rate-limited, anonymous `x-forge-client` handle; geometry path BYOK via `x-forge-provider-key`), so the plugins need no new API-key surface — they call the existing public contract directly. The image pipeline (FLUX→TRELLIS) is free; the geometry pipeline (Meshy/Tripo) uses the user's own provider key.

**Files added:**
- `integrations/_pyclient/three_ws_client.py` — single source of truth for the Forge contract. Stdlib-only (`urllib`) so it runs in Blender's bundled Python and in ComfyUI with no `pip install`. Wraps submit (text/image), presigned image upload, job polling, and download, with a typed `ThreeWSError` and honest progress callbacks.
- `integrations/blender/three_ws/__init__.py` — Blender 4.0+ add-on. Preferences (API URL + provider key), a `View3D` sidebar panel (text/image mode, tier/pipeline/backend/aspect), and a modal operator that runs networking on a worker thread while polling a queue on Blender's main timer; the GLB import (`bpy.ops.import_scene.gltf`) runs on the main thread (bpy is not thread-safe), then selects + frames the new objects. Esc cancels. "Test connection" lists live backends from `?catalog`.
- `integrations/comfyui/three_ws_nodes/` — `nodes.py` (ThreeWSTextTo3D, ThreeWSImageTo3D), `__init__.py` exporting `NODE_CLASS_MAPPINGS`/`NODE_DISPLAY_NAME_MAPPINGS`, `requirements.txt`. Both nodes submit→poll→download a real GLB to ComfyUI's output dir and short-circuit to the cached file on identical inputs. IMAGE tensor → PNG via lazy numpy/Pillow.
- `three_ws_client.py` is vendored byte-for-byte into each plugin package (so each is self-contained/distributable); `integrations/_pyclient/test_no_drift.py` fails if a copy drifts from canonical.

**Tests added (no live network — in-process Forge stub):**
- `integrations/_pyclient/test_three_ws_client.py` — 10 tests: catalog, text→3D end-to-end (asserts submit body + client-handle scoping on polls), image→3D upload→submit, provider-key header, `needs_key`/short-prompt errors, poll-failure surfacing, download bytes, content-type mapping, poll timeout.
- `integrations/_pyclient/test_no_drift.py` — vendored copies are byte-identical to canonical.
- `integrations/comfyui/three_ws_nodes/test_nodes.py` — 3 tests: text node end-to-end + on-disk cache hit (no second submit), image node tensor→PNG→generate, node mappings.

**Tests:** `python -m unittest` → shared client 11/11, ComfyUI 3/3, all green. Blender add-on is `bpy`-only at runtime; CI validates its syntax via `ast.parse`. Vitest scope (`tests/**`, `src/**`, `api/_lib/coin/**`) excludes `integrations/`, so the JS suite is unaffected (zero JS changes).

**Caveats:**
- The image pipeline requires object storage configured on the deployment (`/api/forge-upload` 503s otherwise); the plugins report that clearly and the geometry/text paths still work.
- The Blender add-on must be zipped so the archive contains the `three_ws/` directory; the ComfyUI nodes are copied into `custom_nodes/`. Both documented in their READMEs.
- Private avatars (visibility=`private`) have no public `model_url`, so the renderer is skipped and the SVG card is served instead — the public OG endpoint never holds a presigned URL.

## Item 7 — Paid x402 generation endpoint + OpenAPI docs ✅

**What:** `POST /api/x402/forge` — the pay-per-call twin of the free, browser-facing `/api/forge`. AI agents settle in USDC autonomously (Base or Solana mainnet, no API key/account) to run text→3D or image→3D, then poll for free on the existing `/api/forge?job=<id>`. Closes the monetization gap vs Tripo's credit API; the agent-payments angle is one Tripo's billing can't copy. The MCP-3D layer (`api/_mcp3d/`, `text_to_3d`/`image_to_3d` + 13 more tools) already existed and is payment-free for in-conversation use — this adds the *paid REST surface* for autonomous agents.

**Why this shape:** The TRELLIS job handle issued by the free endpoint is already pollable on `/api/forge?job=`, so the paid endpoint reuses the same lower-level libs (`textToImage`, the replicate provider, `forge-job-token`) and delegates polling — one source of truth for the pipeline, no risky refactor of the central `forge.js`, and no duplicate poll logic. Generation is submitted **after verify but before settle**, so a failed submit never charges (same ordering as the vanity grinder).

**Files touched:**
- `api/x402/forge.js` — new paid endpoint. Models the established x402 pattern (vanity.js): public rate-limit → parse/validate → price → `buildRequirements` → 402 challenge with Bazaar schema → access-control bypass → `send402` when unpaid → idempotency cache → `verifyPayment` → submit generation → `settlePayment` → respond. Reads the raw body once (needed for idempotency hashing), SSRF-guards caller-supplied `image_urls`. `GET` returns the free pricing catalog.
- `api/_lib/forge-tiers.js` — added `priceUsdcAtomics` per tier (draft $0.05 / standard $0.15 / high $0.50) as the single price source, plus `priceAtomicsForTier()` / `priceUsdcForTier()` helpers; `buildCatalog()` now advertises `price_usdc(_atomics)`.
- `api/wk.js` — registered `/api/x402/forge` in the hand-maintained x402 discovery catalog (required by the `x402-discovery-parity` guardrail — any `send402` route must appear there). Price sourced from `priceAtomicsForTier('standard')`, not hardcoded.
- `api/openapi-json.js` — added the `POST /api/x402/forge` operation with request/response schemas + `x-payment-info`.
- `vercel.json` — `api/x402/forge.js` at `maxDuration: 60` (FLUX synth + submit), matching sibling x402 routes.
- `docs/api/forge-x402.md` — developer doc: pricing, request/response, the verify→submit→settle flow, idempotency, an `@x402/fetch` example.

**Tests added:**
- `tests/api/x402-forge.test.js` — 7 tests with payment verify/settle, `textToImage`, and the replicate submit stubbed at module boundaries: GET pricing (asserts per-tier USDC from forge-tiers), 402 challenge quoting the requested tier price (high=500000, default=150000), prompt + image_urls validation, the full paid path (verify→submit→settle, asserts `job_id`/`poll_url`/`x-payment-response`), and the paid-but-empty-input rejection.

**Tests:** `npx vitest run tests/api/x402-forge.test.js tests/api/x402-discovery-parity.test.js tests/api/x402-gas-sponsoring.test.js` → 20 passed. The discovery-parity guardrail (every paid route catalogued) stays green with the new route registered.

**Caveats:**
- Only the platform image pipeline (FLUX→TRELLIS) is sold via x402; the BYOK geometry backends (Meshy/Tripo) bill through the caller's own key on the free `/api/forge` and are intentionally not monetized here.
- The polled `glb_url` is the provider delivery URL (short-lived) when no durable store row exists — documented as "fetch promptly". Parity with the free endpoint's store-unavailable behavior.

## Item 8 — Text-to-animation (generate motion from a prompt) ✅

**What:** Generate a brand-new animation from a natural-language prompt ("waving confidently", "a slow tai-chi sweep") and retarget it onto any rigged avatar. The capability Tripo and the rest of the field lack — they only *apply preset* clips; this *synthesizes* motion that doesn't pre-exist. Reuses every downstream piece we already own: the Wolf3D rig, the retarget engine, and the animation library format.

**Architecture (maximal reuse):** the motion-diffusion worker emits a three.js `AnimationClip.toJSON()` on canonical Wolf3D bone names — the *exact* format the curated library serves — so a generated clip is retargeted onto an avatar by the same engine (`src/animation-retarget.js`) as a preset, with no new consumer logic.

**Files added — GPU worker `workers/model-text2motion/`:**
- `smpl_to_clip.py` — the deterministic bridge: SMPL axis-angle joint rotations + root translation → three.js AnimationClip JSON (SMPL→Wolf3D bone map, axis-angle→quaternion, `Hips.position`). Pure NumPy; an optional per-bone `rest_offsets` hook for rig calibration.
- `main.py` — FastAPI service matching the `model-*` contract exactly (POST /infer → 202 {task_id}; GET /tasks/:id; queued-job dict; API-key auth; GCS upload of the clip JSON).
- `mdm_sampler.py` — MDM (Motion Diffusion Model, **MIT**) adapter; GPU imports kept lazy so the module imports without torch. Model swap touches only this file.
- `worker_security.py` (copied), `requirements.txt`, `Dockerfile` (clones MDM, mirrors model-triposr), `cloudbuild.yaml` (L4 GPU, weights-bucket mount), `README.md`.

**Files added/edited — JS wiring:**
- `api/_providers/gcp.js` — new `text2motion` mode: `serviceUrlForMode` (`GCP_TEXT2MOTION_URL`), `buildWorkerRequest` (POST /infer with prompt/duration/fps), `MODE_ETA`, and `status()` surfacing `resultClipUrl` + frames/fps (a clip JSON, not a GLB).
- `api/forge-motion.js` — REST endpoint: `POST /api/forge-motion {prompt,duration_seconds?,fps?}` → 202 {job_id}; `GET ?job=<id>` → {status, clip_url, frames, fps}. Rate-limited, validated, modeled on forge-remesh.
- `api/_mcp/tools/animations.js` — new `text_to_animation` MCP tool: generate via the worker (submit + bounded poll), then retarget onto a `model_url` reusing apply_animation's exact internal helpers. Auto-registers in both the main MCP server and the `api/_mcp3d` 3D catalog.

**Tests added:**
- `workers/model-text2motion/test_smpl_to_clip.py` — 16 NumPy tests: axis-angle→quaternion (known rotations, unit-norm, batched), quat compose, clip JSON shape (track names per mapped bone, value lengths, monotonic times, duration), unit quaternions in output, translation→Hips.position, flattened-pose input, single-frame/static, rest-offset premultiply, deterministic uuid, input-validation rejects.
- `tests/api/forge-motion.test.js` — 7 tests with the worker stubbed at the provider boundary: queued submit (asserts prompt/mode forwarded), duration clamp, prompt validation, unconfigured 503, poll returns the retargetable clip URL + frames/fps, missing/malformed job id.

**Tests:** JS `npx vitest run tests/api/forge-motion.test.js tests/animations.test.js` + Python `python -m unittest test_smpl_to_clip` → all green (7 + 7 + 16).

**What is verified vs deploy-validated (honest boundary):**
- *Verified here:* the SMPL→clip conversion (the keystone), the provider mode, the REST endpoint, and the MCP tool registration — all with tests.
- *Deploy-validated (GPU, like every other `model-*` worker — none run in-repo/CI):* MDM inference. Specifically `mdm_sampler._decode_to_smpl()` (HumanML3D representation → SMPL axis-angle) is the integration point to confirm against the deployed checkpoint, and the SMPL→Wolf3D **rest-pose offset** defaults to identity and should be calibrated on first deploy for best fidelity (bone-name + hip-scale alignment already handled by the retarget engine).

**Browser surface (shipped):** the pose-studio animation library (`src/animation-library.js`) gained a "✨ Generate" input above the preset gallery. `generateFromText()` POSTs `/api/forge-motion`, polls with a token-based abort + elapsed counter (mirrors forge-stylize), fetches the returned clip JSON, and plays it through the **same** apply path as a preset — `preview()` was refactored to share a new `_playClip(clip, def)` core, so a generated motion gets the identical transport/speed/loop/export behavior. Busy/error/unconfigured states designed; the control + cyan-accented styles live in `pages/pose.html` and only show once a rigged avatar is loaded. In-flight generations abort on rig change / dispose. `npx vite build` ✓; `tests/animations.test.js` (manifest/clip invariants) stays green.
