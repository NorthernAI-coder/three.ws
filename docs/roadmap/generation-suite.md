# three.ws — AI Generation Suite Roadmap (prompt→3D, image→3D, full Meshy/Tripo class)

**This is the platform's current top priority.** The goal is a generation suite that matches
Meshy and Tripo feature-for-feature on quality and beats them on agent-nativeness — and,
above all, that **actually works in production**. The repo already contains most of the
surface area; the gap is between "code exists" and "a user can run it on three.ws today."

Status below is from a **live production audit on 2026-06-11** — every row was probed
against the deployed endpoints, not inferred from code.

---

## Verified current state

| Feature | Code | Production reality (verified) |
|---|---|---|
| Text→3D (`/forge`, FLUX/Imagen → TRELLIS) | ✅ complete | ❌ **was broken** — Vertex path crashed on malformed `GCP_SERVICE_ACCOUNT_JSON` with no Replicate fallback. Fixed in code 2026-06-11; needs deploy. |
| Image→3D (`/forge`, 1–4 views → TRELLIS) | ✅ complete | ❌ **was broken** — Replicate 404s unversioned community-model submits (`firtoz/trellis`). Fixed in code 2026-06-11 (version-resolve retry); needs deploy. |
| Image upload (R2 presign) | ✅ complete | ✅ works (verified live) |
| Tier/backend catalog + gallery | ✅ complete | ✅ works (verified live) |
| Meshy / Tripo geometry path (BYOK) | ✅ complete | ⚠️ reports `configured: true`; untested without a BYOK key — needs a live key test |
| x402 paid generation (`/api/x402/forge`) | ✅ complete | ⚠️ untested live; shares the (broken→fixed) submit path, so re-verify after deploy |
| Auto-rig (`?action=rig`) | ✅ complete | ❌ 501 — `REPLICATE_RERIG_MODEL` unset, `workers/unirig` not deployed |
| Remesh / retopo / lowpoly (`/api/forge-remesh`) | ✅ complete | ❌ 503 — `workers/remesh` not deployed, `GCP_REMESH_URL` unset |
| Stylize (`/api/forge-stylize`) | ✅ complete | ❌ 503 — `workers/stylize` not deployed |
| Part segmentation (`/api/forge-segment`) | ✅ complete | ❌ 503 — `workers/segment` not deployed |
| Background removal (`/api/forge-rembg`) | ✅ complete | ❌ 503 — `workers/rembg` not deployed |
| Text→animation (`/api/forge-motion`) | ✅ complete | ❌ 503 — `workers/model-text2motion` not deployed |
| Retexture full/region (`/api/studio/retexture-*`) | ✅ complete | ❌ dead — `GCP_TEXTURE_URL` unset; also MCP/API-only, no `/forge` UI |
| Talking-avatar video | ✅ complete | ❌ dead — `LONGCAT_WORKER_URL` unset |
| MCP 3D Studio tools (15 tools) | ✅ complete | ⚠️ tools resolve but inherit every breakage above |

Root cause in one sentence: **the API layer shipped, the compute layer behind it never got
deployed, and the two flows that don't need GCP workers died on two provider regressions
nobody noticed because nothing smoke-tests production.**

---

## Phase 0 — Restore the core (now)

The two flows everything else builds on.

1. **Ship the 2026-06-11 fixes** (done in repo, needs deploy):
   - `api/_providers/replicate.js` — on 404 from the unversioned model endpoint, resolve
     `latest_version` and retry version-pinned. Unbreaks image→3D and text→3D's mesh step.
   - `api/_mcp3d/text-to-image.js` — Vertex failure now falls back to Replicate FLUX;
     Vertex's inline data-URI PNG is persisted to R2 and submitted as an https URL.
   - `api/_mcp3d/vertex-imagen.js` — tolerant service-account JSON parsing (quoted /
     escaped / base64 manglings), designed `unconfigured` error instead of a parse crash.
   - Regression tests: `tests/api/providers-replicate.test.js`, `tests/api/text-to-image.test.js`.
2. **Fix `GCP_SERVICE_ACCOUNT_JSON` in Vercel prod** — re-paste the raw key-file JSON
   (current value is mangled; the fallback masks it, but Imagen is the better/cheaper path).
3. **Verify `VERTEX_IMAGEN_MODEL`** — default `imagen-3.0-generate-001` may be retired on
   Vertex; pin a current Imagen model explicitly.
4. **Post-deploy smoke test, both flows, in prod**: submit text→3D draft → poll → GLB loads;
   submit image→3D → poll → GLB loads. No green checkmark without a real GLB.

**Done when:** a first-time visitor on three.ws/forge gets a model from a prompt and from a
photo, draft tier, under 2 minutes, zero console errors.

## Phase 1 — Light up the built-but-dark compute (next)

Everything here is written and containerized; it needs deployment + env wiring.

1. **Deploy automation for the editing workers.** `workers/deploy/deploy-all.sh` only covers
   the avatar pipeline (controller / mesh models / unirig). Extend it (or add
   `deploy-editing.sh`) to build + deploy `remesh`, `stylize`, `segment`, `rembg`, `texture`,
   `model-text2motion` from their existing Dockerfiles/cloudbuild.yaml, and print the URL +
   key pairs for Vercel env.
2. **Set the env vars** (names): `GCP_REMESH_URL`, `GCP_STYLIZE_URL`, `GCP_SEGMENT_URL`,
   `GCP_REMBG_URL`, `GCP_TEXTURE_URL`, `GCP_TEXT2MOTION_URL`, `GCP_TRIPOSG_URL`
   (+ shared `GCP_RECONSTRUCTION_KEY`), `LONGCAT_WORKER_URL`/`LONGCAT_WORKER_KEY`.
3. **Auto-rig**: deploy `workers/unirig` (or pin a Replicate UniRig build) and set
   `REPLICATE_RERIG_MODEL` / route through the GCP pipeline. Rig is the gateway to the
   avatar/animation economy — it unlocks `/forge-motion` clips on generated meshes.
4. **Per-feature prod verification**, same bar as Phase 0: real mesh in, real result out.
5. **Production health surface.** `?catalog` says `configured: true` when an env var exists —
   that's how two dead flows looked green. Add a `/api/forge?health` that live-probes each
   provider (cheap HEAD/auth checks) + a scheduled smoke test that runs a draft generation
   daily and alerts on failure.

**Done when:** every row in the table above reads ✅, verified in prod, and a daily smoke
test guards regressions.

## Phase 2 — Parity gaps vs Meshy / Tripo

What they have that we don't (or that we hide). Ordered by user impact.

1. **Surface the hidden tools in `/forge`.** Retexture (full + region/magic-brush) and
   text→animation exist as APIs/MCP tools with no UI. The result panel should offer:
   Retexture · Remesh · Stylize · Segment · Rig · Animate · Export — one pipeline, one page.
2. **Preview → refine flow.** Meshy's signature UX: cheap fast preview, then one-click refine
   of the chosen result (re-run at high tier conditioned on the same seed/reference). We have
   the tier system; add "Refine this" on every draft result.
3. **Export formats.** The remesh worker already converts glb/obj/stl/ply/usdz/3mf/fbx —
   expose a format picker on download instead of GLB-only.
4. **PBR material controls.** High tier claims PBR; expose map outputs (albedo/normal/
   roughness/metallic) and a re-bake option in the result panel.
5. **Sketch→3D.** ✅ Built 2026-06-12 on TripoSG-scribble (VAST AI, MIT) — a native
   sketch+prompt→geometry model, not a controlnet preprocessing hack. New
   `workers/model-triposg` GPU worker (also added to the avatar pipeline's mesh pool as
   the TripoSR quality successor), `sketch` path through forge-tiers / gcp provider /
   `/api/forge`, and a "From a sketch" mode on `/forge` that only appears when the
   engine is live. ❌ Not deployed: stage weights (`stage-weights.sh`, key `triposg`),
   deploy the worker (`deploy-all.sh`), set `GCP_TRIPOSG_URL` in Vercel. Output is
   untextured geometry — pairs with retexture/stylize (item 1).
6. **Job webhooks + public API docs.** Replicate webhook plumbing exists for avatars; extend
   to forge jobs and publish the endpoint contract (we already sell it via x402 — document it
   like a product, with examples).
7. **Community gallery.** The private per-client gallery exists; add opt-in public showcase
   with remix ("generate a variation of this").

## Phase 3 — Where we beat them

1. **Agent-native generation.** Meshy/Tripo sell to humans with credit cards; we sell to
   agents with wallets. x402 pricing + MCP tools are live differentiators — market them,
   benchmark them, keep them first-class in every new feature.
2. **Text→animation on generated meshes.** Neither Meshy nor Tripo generates animation.
   Generate → rig → animate from one prompt chain is a demo nobody else can run.
3. **Generate → place.** One-click "drop into world": a generated asset becomes a networked
   object in `/play` (Wave 0 object sync from the 3D-world roadmap). The generation suite
   feeds the sandbox economy; assets become $three-priced cosmetics and props.
4. **Holder perks.** Generation tiers/quotas for $three holders (the only coin: 
   `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).

---

## Operating rules for this roadmap

- **"Works" means verified in production**, by running it, after deploy. The 2026-06 audit
  found two fully-tested, fully-wired flows that were 100% dead in prod. Tests passing is
  not the bar; a stranger getting a GLB is the bar.
- Fix the smallest broken thing that unblocks a whole flow before building anything new.
- Every phase ends with the daily smoke test extended to cover what it shipped.
