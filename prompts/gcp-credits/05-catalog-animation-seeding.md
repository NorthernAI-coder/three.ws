# 05 — Bulk catalog & animation seeding on the self-hosted GPU fleet

## Mission

Use the self-hosted GPU lanes (prompt 04) to mass-produce durable platform content that outlives
the credits: a much larger curated avatar catalog and a generative text→motion animation library
listed in the marketplace. This is the "credits → permanent assets" play. Quality-gate
everything — a catalog of 5,000 junk meshes is worse than today's catalog. Verify the browsing
surfaces hold up at the new scale.

## Prerequisites (stop and report if missing)

- Prompt 04 live in at least preview: `MODEL_TRELLIS_URL` etc. set, self-host lanes healthy,
  `FORGE_SELFHOST_PRIMARY` available. text2motion service deployed (`GCP_TEXT2MOTION_URL`).

## Context (from prior code audit; re-verify)

- **Seed cron exists:** `api/cron/forge-seed-cron.js` runs ~per-minute, generates real avatars
  on the free NIM draft lane, attributes each to a fresh OG-username user, publishes to the
  avatars table. Prompt library: `api/_lib/seed-prompts.js` (200+ prompts).
- **Catalog surfaces:** `api/avatars/`, `/gallery`, `/dashboard/avatars`, curated GLBs in
  `public/avatars/`.
- **Animation marketplace:** `api/marketplace/animations.js` (creator-listed clips) with x402
  download route `api/x402/animation-download.js`. The Mixamo library (2,800+ retargeted clips)
  is already live at `/animations`, served from R2 (`animations/library/clips/*.json` +
  `manifest.json`, endpoint `GET /api/animations/library`).
- **Vision QA available:** `api/vision.js` / `api/_lib/vision.js` can describe a render — usable
  as an automated quality gate.
- Assets land in R2 via `api/_lib/r2.js` (`forge/…` prefixes); thumbnails already part of the
  pipeline.

## Tasks

### A. Avatar catalog seeding (target: +3,000–5,000 *curated* avatars)

1. **Upgrade the seed cron** to use the self-hosted lane when `FORGE_SELFHOST_PRIMARY=1`
   (it should inherit this from prompt 04's routing — verify, don't assume) and make its
   cadence/batch size env-tunable (`SEED_CRON_BATCH`, default = current behavior).
2. **Expand `seed-prompts.js`** meaningfully: broaden coverage (professions, fantasy, sci-fi,
   animals-as-props vs humanoids, styles) with attention to what makes good *rigged* avatars —
   humanoid, front-facing, full-body. Keep prompts coin-neutral (no third-party crypto
   references — commit gate).
3. **Automated quality gate before publish:** render thumbnail → `api/vision.js` check
   (humanoid? complete body? not a blob?) + mesh sanity (vertex count bounds, has texture).
   Failing assets are not published (keep them in R2 under a `forge/rejected/` prefix with the
   reason, for tuning). Track accept rate.
4. **Rig the keepers:** run accepted avatars through UniRig so catalog entries are
   animation-ready (that's the product bar — a catalog avatar that T-poses is half-built).
   Verify a sample in the viewer with idle/walk clips playing.
5. **Batch runner:** a resumable script `scripts/gcp/seed-avatars.mjs` (checkpoint file, safe
   to re-run, parallelism tuned to deployed GPU count) for bulk runs beyond the cron cadence.
   Run it for a first real batch (e.g. 500) end to end before scaling up; report accept rate
   and $/accepted-asset, then continue to target if quality holds.

### B. Animation library seeding (target: +500–1,000 curated motion clips)

6. **Prompt set for text2motion:** build a motion prompt library (locomotion variants, emotes,
   dances, combat, idles, interactions) — a data file, not hardcoded.
7. **Batch generate → retarget → publish:** generate clips via `GCP_TEXT2MOTION_URL`, convert
   to the canonical-skeleton clip JSON format the library uses (match the Mixamo library's
   format exactly — inspect existing clips in R2/`public/animations/`), upload under a distinct
   prefix (`animations/library/generated/…`), and update the manifest. QA gate: clip duration
   sane, no NaN keyframes, plays on the default rig without foot-sliding disasters (spot-check
   a sample visually in the viewer).
8. **Marketplace listing:** list the generated set in `api/marketplace/animations.js` under a
   platform creator identity, priced consistently with existing listings, downloadable via the
   existing x402 route. Free tier: consider adding a rotating subset to the free library —
   owner-visible decision; implement the mechanism, note the policy choice in the report.

### C. Scale-proofing the surfaces

9. With the catalog at 5–10× size: verify `/gallery`, `/dashboard/avatars`, `/animations`, and
   the marketplace list endpoints paginate (not fetch-all), thumbnails lazy-load, and API
   responses stay bounded. Fix what breaks — pagination, indexes on the avatars table, manifest
   sharding if the animation manifest gets huge. Test at realistic counts, not 10 items.

## Guardrails

- Curation over volume. If accept rate is poor, stop scaling and tune prompts/gates first;
  report honestly.
- All batch spend is on self-host lanes (credits) — never let a bulk run fall through to
  Replicate; assert the backend in the batch script and abort on fallthrough.
- Cron changes must be no-ops when the new env vars are unset.

## Acceptance criteria

- [ ] Seed cron upgraded + env-tunable; quality gate live with measured accept rate.
- [ ] First avatar batch published: rigged, animated in viewer, browsable in gallery.
- [ ] Generated motion clips live in library + marketplace; sample visually verified.
- [ ] Scale test at target counts passes on all four surfaces; fixes committed.
- [ ] $/accepted-asset and accept-rate numbers in `docs/gcp-credits.md`.
- [ ] `npm test` green; `git diff` reviewed (no `api/` esbuild-mangled files).

## Wrap-up

Changelog entries (users notice: bigger catalog, new generated-animations collection) —
plain language. Update docs (`docs/gcp-credits.md`; marketplace/animations docs if they exist).
Commit explicit paths, push `threews` (+ attempt `threeD`). Report: counts published, accept
rates, spend, and remaining headroom.
