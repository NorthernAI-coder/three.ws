# Auto-rig hardening program

A 9-part, self-contained prompt program to take three.ws auto-rigging from
"shipped but fragile" to production-grade. Each file is written to be pasted
into a **fresh Claude Code chat** at the repo root and executed end to end —
no prior context needed.

## Why this exists

three.ws already auto-rigs avatars created from prompts and selfies, and a
recent change extended auto-rig to **every** creation path (upload, URL import,
chat/MCP forge save) with a webhook + poll + cron completion backstop. A
multi-agent adversarial audit of that work surfaced **41 verified-new issues**.
This program turns those findings into discrete, acceptance-tested tasks.

The headline finding: the original implementation **mutated the avatar in place**
(rewrote `storage_key`), which silently breaks attestation, IPFS pins, embeds,
version history, and concurrent edits. Prompt **01 is the keystone** — it
converts auto-rig to **sibling-materialization** (the rigged GLB becomes a new
avatar row with `parent_avatar_id` = the static source, and the agent is
re-pointed), which dissolves that whole bug class. Every later prompt assumes
the sibling model.

## Run order & dependencies

Run **01 first** — it changes the data model the rest build on. After that,
02–09 are largely independent and can run in parallel chats, with the noted
soft dependencies.

| # | Prompt | Depends on | What it fixes |
|---|--------|-----------|---------------|
| 01 | [01-sibling-materialization.md](01-sibling-materialization.md) | — | **Keystone.** In-place swap → rigged sibling; fixes checksum/attestation, IPFS, embeds, versioning, lost-update races. |
| 02 | [02-completion-statemachine.md](02-completion-statemachine.md) | 01 | Orphaned `done`+null jobs no driver recovers; cron reaper starved under backlog; reuse delivered-but-unfinalized results; concurrent-finalize idempotency. |
| 03 | [03-ssrf-hardening.md](03-ssrf-hardening.md) | — | The webhook host-pins provider URLs; the poll, cron, and reconstruct paths do **not**. Centralize the guard. |
| 04 | [04-cost-and-consent-gates.md](04-cost-and-consent-gates.md) | 01 | Every static create fires a paid GPU job bypassing the rate limiter; no humanoid gate; private avatars exfiltrated via permanent public URL. |
| 05 | [05-coverage-gaps.md](05-coverage-gaps.md) | 01 | MCP `save_avatar` never rigs (or provisions an agent); fork mid-rig mislabels; manual rig panel races auto-rig. |
| 06 | [06-rig-cache-and-backfill.md](06-rig-cache-and-backfill.md) | 01, 04 | Checksum-keyed rig cache (templates + dupes become instant/free); backfill the existing static catalog. |
| 07 | [07-quality-gate-and-fallback.md](07-quality-gate-and-fallback.md) | 01 | Validate the rig actually drives the clip library before publishing the sibling; GCP UniRig fallback for Replicate outages. |
| 08 | [08-observability-and-events.md](08-observability-and-events.md) | 01 | `avatar.rigged` webhook event; lifecycle metrics; "Rigging…→Animation-ready" UI; failure-rate / backlog alerts. |
| 09 | [09-test-suite.md](09-test-suite.md) | 01–08 | Full unit + integration coverage of the new paths; refresh `scripts/verify-auto-rig.mjs`. Run **last**. |

Suggested waves:
1. **01** (alone — data-model change).
2. **02, 03, 04, 05, 07, 08** in parallel chats.
3. **06** (after 04), then **09** (after everything).

## Deferred follow-ups (tracked here, not yet prompted)

Surfaced by the audit and referenced from 01's "Out of scope" — promote to their
own prompts when 01 lands:

- **GLB-proxy cache-busting** — the id-keyed proxy at `api/avatars/[id]/[action].js:656`
  sends `immutable`/long `s-maxage`; even with a new sibling id, audit whether any
  embed/SDK consumer caches by source id and add explicit purge/ETag handling.
- **Rigged-sibling IPFS re-pin** — when a pinned avatar gets a rigged sibling,
  orchestrate a real Pinata re-pin + re-attestation of the rigged bytes (01 only
  avoids the orphan).
- **Parent→rigged lineage UX** — "view original", lineage badge, and grid dedupe
  so the rigged sibling and its static parent read as one entity in the gallery.

## Conventions every prompt follows

- Embeds the non-negotiable operating rules (no mocks, `$THREE`-only, dual-remote
  push, changelog discipline, definition of done).
- Grounded in **real file paths + line numbers** verified against the codebase.
- Numbered, acceptance-tested requirements with explicit verification commands.

## Provenance

Derived from the multi-agent auto-rig audit (41 verified findings across
correctness, security, data-integrity, cross-feature/UX, scale, and tests).
Findings excluded from this program because they were already fixed in the
shipping code: the cron backstop, stale-variant invalidation, and the
double-job idempotency guard.
