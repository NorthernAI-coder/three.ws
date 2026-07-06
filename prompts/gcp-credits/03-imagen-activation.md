# 03 — Activate the dormant Vertex Imagen lane

## Mission

The repo already contains a complete Vertex AI Imagen client that nobody turned on. Activate it
so the image-generation legs of the forge pipeline bill to our GCP credits instead of NVIDIA
NIM FLUX / Replicate, verify quality end to end, and keep automatic fallback intact. This is
the smallest prompt in the pack — its value is in *verification*, not code volume. Do not stop
at "env var set"; prove the pixels.

## Prerequisites

- Prompt 01 ran: `GCP_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`
  set in Vercel (`vercel env ls`). If prompt 02 already ran, `api/_lib/gcp-auth.js` exists —
  use it (see task 2).

## Context (from prior code audit; re-verify)

- `api/_mcp3d/vertex-imagen.js` — full Imagen client: SA JWT→OAuth exchange (~lines 55–217),
  endpoint `https://{location}-aiplatform.googleapis.com/v1/projects/{P}/locations/{L}/publishers/google/models/{MODEL}:predict`,
  env `VERTEX_IMAGEN_MODEL` / `VERTEX_IMAGEN_EDIT_MODEL`. Its header comment explicitly frames
  it as the $100k-credit burner.
- `api/_mcp3d/text-to-image.js` — provider selector: **prefers Vertex Imagen whenever
  `GOOGLE_CLOUD_PROJECT` is set**, else NVIDIA NIM FLUX, else Replicate.
- Consumers: `api/x402/forge.js` and the paid text→3D chain (Granite prompt director →
  reference image → TRELLIS/Hunyuan3D reconstruction). The reference image drives 3D quality,
  so image quality directly affects the paid product.

## Tasks

1. **Audit the dormant client.** Read `vertex-imagen.js` fully. Check the model IDs it defaults
   to against currently-available Imagen models on Vertex (`gcloud ai models` / Model Garden —
   Imagen versions rotate; older IDs 404). Update defaults if stale. Confirm the request shape
   (aspect ratio, safety settings, person generation params) matches the current `:predict`
   schema.
2. **Deduplicate auth** if prompt 02 landed: refactor `vertex-imagen.js` onto
   `api/_lib/gcp-auth.js`. If 02 hasn't run, leave auth in place (02 will extract it) — note
   which order happened in your report.
3. **Flag it like everything else in this program.** `GOOGLE_CLOUD_PROJECT` being set is too
   blunt an activation switch (it's also needed for Vertex Claude and workers). Add
   `VERTEX_IMAGEN_ENABLED=1` as the explicit gate in `text-to-image.js`'s selector, defaulting
   to today's behavior when unset. Keep the fallback ladder (Imagen → NIM FLUX → Replicate) on
   any error.
4. **Telemetry.** Ensure whichever provider actually served an image is recorded (log line or
   existing provider-health mechanism) so spend attribution and debugging work.
5. **End-to-end verification (required):**
   - Direct: script or curl the text-to-image path with the flag on; save an output image and
     look at it (Read tool renders images) — confirm it's a real, on-prompt image.
   - Pipeline: run the paid-lane forge chain locally (`npm run dev`, drive
     `/api/forge` the way `mesh_forge` does per `mcp-server/src/tools/_studio-core.js`) with
     Imagen active; confirm the reference image comes from Imagen (telemetry) and the resulting
     GLB is sane.
   - Quality gate: generate the same 3–4 prompts via Imagen and via the current FLUX lane;
     compare side by side. If Imagen's output is clearly worse for this use case (stylized 3D
     reference images), say so honestly in the report and recommend scope (e.g. Imagen for
     seed/draft lanes only) — do not silently ship a quality regression on the paid lane.
   - Fallback: break the Imagen call (bogus model ID locally), confirm clean fallthrough to
     FLUX with no user-visible error.
6. **Deploy:** set `VERTEX_IMAGEN_ENABLED=1` in Vercel preview; production only if the quality
   gate passed cleanly — otherwise leave to the owner with your recommendation.

## Acceptance criteria

- [ ] Imagen model IDs verified current; client request shape verified against live API.
- [ ] `VERTEX_IMAGEN_ENABLED` gate added; unset ⇒ byte-identical current behavior.
- [ ] Real generated image inspected; paid-lane E2E run served by Imagen; fallback proven.
- [ ] Quality comparison done and reported with an honest recommendation.
- [ ] Provider attribution visible in logs.
- [ ] `npm test` green; `git diff` reviewed.

## Wrap-up

Update `docs/gcp-credits.md` (flag, models, rollback). Changelog entry only if user-visible
(likely not — infra swap). Commit explicit paths, push `threews` (+ attempt `threeD`). Report
quality verdict + which env is live where.
