# 08 — Expiry revert & keep/kill decision runbook

## Mission

The credits expire in ~2 months. This prompt makes expiry a non-event: produce a single,
tested runbook that reverts every credit-funded reroute back to the pre-program state by
flipping env vars (never migrating code), plus a data-driven keep/kill recommendation for each
lane based on the spend/usage numbers gathered along the way. Run this near the end of the
window — but write it now so the revert path is proven, not improvised under a dead-credits
fire drill.

## Prerequisites

- Prompts 01–07 (or whichever shipped). Reads `docs/gcp-credits.md` for all flags, URLs, and
  cost tables, and the burn report from prompt 07.

## Context — the flags/vars each lane reverts by (verify against what actually shipped)

- Vertex Claude: `VERTEX_CLAUDE_PRIMARY`, `VERTEX_CLAUDE_ENABLED` (prompt 02).
- Imagen: `VERTEX_IMAGEN_ENABLED` (prompt 03).
- Forge GPU: `FORGE_SELFHOST_PRIMARY` + `MODEL_TRELLIS_URL` / `GCP_HUNYUAN3D_URL` /
  `GCP_TRIPOSG_URL` / `GCP_RECONSTRUCTION_URL` / `GCP_TEXT2MOTION_URL`; Cloud Run min-instances
  (prompt 04).
- Vanity: batch pipeline is one-shot; inventory persists (prompt 06) — sells down naturally.
- Observability: budget alerts, dashboards (prompt 07).
- Claude Code dev: `scripts/gcp/claude-code-vertex.sh` (just stop sourcing it).

## Tasks

1. **Revert script + runbook.** `scripts/gcp/revert-to-free.sh` (idempotent, dry-run flag) that:
   unsets/turns off every primary flag so all lanes fall back to their pre-program providers
   (free LLM lanes, hosted NIM/Replicate forge, NIM FLUX imagen), drops all Cloud Run worker
   min-instances to 0, and prints a checklist of Vercel env changes to apply (with the exact
   `vercel env rm/add` commands). Document in a new `docs/gcp-credits-revert.md` (or a section
   of the main doc) as a step-by-step a tired human can follow at 2am.
2. **Prove the revert.** In preview: flip everything to program-on, confirm lanes use GCP;
   run the revert; confirm every feature still works on the free/original providers with no
   user-visible breakage. This is the whole point — a revert that hasn't been run is not done.
3. **Data-driven keep/kill table.** For each lane, pull actual spend (prompt 07 report) and
   usage, and recommend post-expiry disposition:
   - **Vertex Claude:** keep on Vertex (paid, if quality/cost beat first-party Anthropic) vs
     revert to free lanes vs first-party Anthropic — with the token-cost comparison.
   - **Forge paid lane:** the GPU self-host made it ~100% margin on credits; post-expiry L4
     Cloud Run costs real money. Compute the per-asset cost vs the $0.25/$0.45 price — is it
     profitable to keep self-hosting, or revert to Replicate/hosted-NIM? Show the math.
   - **Imagen / seed cron / text2motion / vanity:** keep, pause, or one-shot-done.
   Each recommendation cites numbers, not vibes.
4. **Preserve the durable assets.** Confirm everything meant to outlive the credits is on R2 and
   independent of GCP: the seeded avatar catalog, generated animation library, vanity inventory,
   any BigQuery-derived snapshots baked to static. Nothing user-facing may depend on a
   GCP resource that dies with the credits — audit and list any that do, with a fix.
5. **Weights/artifacts cleanup plan.** Document what to delete at expiry (GCS weights buckets,
   Cloud Run services, spot images) to stop any post-credit billing, and what to keep. Do NOT
   delete anything now — just the documented plan + a `scripts/gcp/teardown.sh` (dry-run
   default) for the owner to run when they decide.
6. **Final report to owner.** A one-page summary: total credits used, per-lane spend, what
   shipped that's permanent, keep/kill recommendations with the cost math, and the exact
   env-flip list for the day-of revert.

## Acceptance criteria

- [ ] `scripts/gcp/revert-to-free.sh` exists, idempotent, dry-run tested.
- [ ] Full revert executed in preview and every feature verified working on original providers.
- [ ] Keep/kill table with real spend/usage numbers and cost math per lane.
- [ ] Durable-asset audit: nothing user-facing depends on a dying GCP resource (or fixes filed).
- [ ] `scripts/gcp/teardown.sh` (dry-run default) + deletion plan documented.
- [ ] Owner one-pager written into `docs/gcp-credits.md`.
- [ ] `npm test` green; `git diff` reviewed.

## Wrap-up

No changelog needed (internal). Commit explicit paths, push `threews` (+ attempt `threeD`).
Report the keep/kill recommendations and confirm the revert path is proven, not theoretical.
