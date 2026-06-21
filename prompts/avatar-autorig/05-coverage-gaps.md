# Close auto-rig coverage gaps: MCP `save_avatar`, fork mid-rig, manual/auto double-rig

> One-line: "Paste this into a fresh Claude Code chat at the repo root and execute it fully."

## Operating rules (non-negotiable)
- You are building **three.ws** — a platform meant to compete with the best in the world. Senior-engineer bar: no shortcuts, ship complete polished work.
- **No mocks, no fake data, no placeholders, no TODO comments, no stub functions, no `throw new Error("not implemented")`, no fake setTimeout loading.** Real APIs, real endpoints, real wiring only. If credentials are missing, locate them in `.env` / `vercel env`, else proceed with the real integration.
- **$THREE is the ONLY coin** this platform may reference. Contract: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name, import, hardcode, or recommend any other token anywhere.
- **Concurrent agents share this worktree.** Stage explicit paths only (never `git add -A`/`git add .`); re-check `git status` and `git diff --staged` immediately before any commit.
- **Changelog:** every user-visible change gets an entry in `data/changelog.json` (date, holder-readable title + summary, tags from feature|improvement|fix|sdk|infra|docs|security); then run `npm run build:pages`. Internal-only chores get no entry.
- **Push to BOTH remotes when asked to push:** `git push threeD main` AND `git push threews main`. NEVER pull/fetch/merge from `threeD`; pulls come from `threews` only.
- **Trap:** `npx vercel build` overwrites `api/*.js` with esbuild bundles — before committing an `api/` diff, check `head -1` for `__defProp`/`createRequire` and `git restore -- api/ public/` if contaminated.
- **Definition of done:** code wired + reachable; every state designed; no console errors/warnings from your code; real API calls verified; existing tests pass (`npm test`); `git diff` self-reviewed; you'd demo it proudly to senior engineers.
- Read `CLAUDE.md` and `STRUCTURE.md` first. Use TodoWrite for 3+ step tasks. Keep communication short.

## Context

This is part 5 of a 9-part auto-rig hardening program in `prompts/avatar-autorig/`. The platform auto-rigs static meshes into animation-ready (skeleton-bearing) avatars so every 3D agent can walk, wave, and emote. The HTTP ingest path (`api/avatars/from-forge.js`) and the on-create library (`api/_lib/auto-rig.js`) already do this correctly: after `createAvatar`, they call `provisionAvatarAgent` and `maybeAutoRigAvatar`.

But several **creation and duplication paths do not run the same code**, so an avatar born through them never gets an agent provisioned and never has an auto-rig job submitted — meaning the auto-rig cron in part 06 has nothing to rescue. This part closes those gaps so EVERY way an avatar can be born or copied ends up first-class and animation-ready, consistent with `from-forge.js`.

The four gaps (all confirmed by reading the code — re-confirm each before changing it):
1. The MCP `save_avatar` tool persists a GLB but never provisions an agent and never submits a rig job.
2. `fork.js` copies tags and `forked_from` but drops the source's rig `source_meta`, so the fork misclassifies (and can carry a stale `rigged` tag onto a row with no rig signal).
3. `handleRegenerate` (manual rig) has no in-flight dedupe, so a user clicking "Animate" while an auto-rig job is already running races two rigged GLBs onto the same row.
4. `from-forge.js` records `is_rigged` as `null` (unknown) when a forged mesh is actually static, so `classifyRig` can't label it "static".

> NOTE — keystone dependency: sibling `01-sibling-materialization.md` changes auto-rig to materialize a rigged SIBLING avatar (`parent_avatar_id` = the static source) rather than swapping the GLB in place on the same row. If 01 has already landed when you start, mirror its sibling model in the wiring you add here (the agent is provisioned for the source row; the rig job's completion produces the sibling). If 01 has NOT landed, wire against today's in-place behavior in `api/_lib/auto-rig.js`. Read `api/_lib/auto-rig.js` first to see which model is live, and match it — do not invent a third behavior.

## Background findings (confirmed by reading the code — re-confirm before editing)

- **`api/_mcp3d/tools/studio.js` — `save_avatar` tool (declared ~line 1632, handler ~1678, `createAvatar` ~1741-1763).** The import block (~lines 18-44) imports `createAvatar, storageKeyFor` from `../../_lib/avatars.js`, `putObject` from `r2.js`, `inspectGlb`/`isValidGlbHeader` from `glb-inspect.js` — but **NOT** `provisionAvatarAgent` (`../../_lib/avatar-agent.js`) and **NOT** `maybeAutoRigAvatar` (`../../_lib/auto-rig.js`). After `createAvatar` the handler returns immediately (~1765-1783). No agent is provisioned and no rig job is ever submitted. Compare to the HTTP twin `from-forge.js` which calls both. Also note: `save_avatar` builds `source_meta.is_rigged: info.isRigged ?? null` (~line 1754) — same `null`-on-static bug as gap 4.

- **`api/avatars/from-forge.js` — `is_rigged` provenance (line 143).** `is_rigged: rigged || info.isRigged || null`. When the GLB is genuinely static (`rigged === false`, `info.isRigged === false`), this evaluates to `null` ("unknown"), not `false` ("static"). `classifyRig` (src/shared/rig-classify.js, lines 36-42) only returns `static` when `flag === false`; a `null` flag falls through to `unknown`, so the UI offers to rig but never shows the "Static" badge, and the rigged/static gallery filter in `api/_lib/avatars.js` (~line 285) treats it as un-inspected. The `rigInfo` passed to `maybeAutoRigAvatar` (line 167) correctly uses `info.isRigged === true`, so the rig job is still submitted — only the stored classification is wrong.

- **`api/avatars/fork.js` — fork drops rig provenance (lines 104-122).** The fork's `source_meta` is `{ forked_from }` only (line 112); the source row's rig signal (`is_rigged`, `skeleton_joint_count`, `auto_rigged`) is never carried over. Worse, `tags: src.tags || []` (line 116) copies the source's tags verbatim — if the source carries a `rigged` tag (stamped by `finalizeAutoRigStage`, auto-rig.js line 215) but the copied GLB's `source_meta` has no rig signal, the fork shows a `rigged` tag on a row `classifyRig` calls `unknown`. The fork also never submits an auto-rig job, so forking a still-static avatar yields a static fork with an idle agent.

- **`api/avatars/_actions.js` — `handleRegenerate` no in-flight dedupe (lines 367-429).** It loads the source row (line 375), gets the provider, submits, and inserts a new `avatar_regen_jobs` row (line 416) — with **no** check for an existing in-flight job on the same `source_avatar_id`. `maybeAutoRigAvatar` (auto-rig.js lines 108-116) DOES guard against this with an `inFlight` query before submitting; the manual path does not. A user opening the "Animate" tab (`src/avatar-rig.js` `startRigging`, lines 84-110) while the on-create auto-rig job is still queued/running fires a second `rerig`, racing two results onto one row.

- **`src/avatar-rig.js` (manual rig panel).** `startRigging` POSTs `/api/avatars/regenerate { sourceAvatarId, mode: 'rerig' }` and on `!res.ok` only special-cases `501` (lines 95-102). It does not handle `409`; today a 409 would surface the generic message. It must instead attach to the returned existing `jobId` and resume polling (`pollUntilDone`, line 112).

## Scope — in / out

**In scope:**
- Wire `provisionAvatarAgent` + `maybeAutoRigAvatar` into MCP `save_avatar`, mirroring `from-forge.js`.
- Carry rig `source_meta` into forks; auto-rig still-static forks; never copy a `rigged` tag onto a row with no rig signal.
- Add in-flight dedupe (409 + existing `jobId`) to `handleRegenerate`; teach `src/avatar-rig.js` to attach on 409.
- Fix `from-forge.js` and `save_avatar` `is_rigged` provenance: `false` when inspected-and-static, `null` only when genuinely uninspected.
- Tests for each path.

**Out of scope:** the sibling-materialization redesign (01), the cron rescue + backfill (06), SSRF guard internals (03), cost/consent gates (04), the completion state machine (02), observability/events plumbing (08). Reuse those modules; do not reimplement them.

## Key files & entry points

- `api/_mcp3d/tools/studio.js` — MCP `save_avatar` tool (gap 1 + 4). Imports ~18-44; handler ~1678-1784.
- `api/avatars/from-forge.js` — the HTTP twin that already wires both (the reference pattern); `is_rigged` bug at line 143.
- `api/avatars/fork.js` — fork endpoint (gap 2); `source_meta`/tags at lines 96-122.
- `api/avatars/_actions.js` — `handleRegenerate` (gap 3) at lines 367-429.
- `src/avatar-rig.js` — manual rig panel; `startRigging` 84-110, `pollUntilDone` 112-147.
- `api/_lib/auto-rig.js` — `maybeAutoRigAvatar` (reuse), `rigInfoIsRigged`, the canonical in-flight query (lines 108-116) to mirror in `handleRegenerate`.
- `api/_lib/avatar-agent.js` — `provisionAvatarAgent({ userId, avatarId, avatarName })` (reuse).
- `src/shared/rig-classify.js` — `classifyRig` contract that consumes `source_meta.is_rigged`.
- `api/_lib/avatars.js` — `createAvatar`; `searchPublicAvatars` rig SQL filter (~266-307).

## Requirements

Each requirement has an acceptance criterion. Build all of them.

1. **MCP `save_avatar` provisions an agent and submits a rig job.**
   In `api/_mcp3d/tools/studio.js`, add imports for `provisionAvatarAgent` (`../../_lib/avatar-agent.js`) and `maybeAutoRigAvatar` (`../../_lib/auto-rig.js`). After `createAvatar` (~line 1763) and before building the response, mirror `from-forge.js` lines 154-170: schedule `provisionAvatarAgent({ userId, avatarId, avatarName })` and `maybeAutoRigAvatar({ userId, avatar, rigInfo: { is_rigged: info.isRigged === true, skeleton_joint_count: info.skeletonJointCount ?? null }, source: 'studio' })`. Both are best-effort and must NOT block or fail the tool response. Since the MCP handler is not a request/response wrapper with `queueMicrotask` lifetime guarantees, `await` both (each already swallows its own errors — `maybeAutoRigAvatar` never throws; wrap the `provisionAvatarAgent` call in a try/catch that logs and continues) so the work is not lost when the lambda freezes.
   *Acceptance:* Calling `save_avatar` with a static GLB inserts one `avatar_regen_jobs` row (`mode='rerig'`, `params.auto_rig=true`, `params.source='studio'`) for the new avatar AND creates an `agent_identities` row for it — verified by the new test and by `grep` showing both calls present. Calling it with an already-rigged GLB inserts NO rig job (`maybeAutoRigAvatar` returns `already_rigged`).

2. **`fork.js` carries rig `source_meta` into the fork.**
   When building the fork's `source_meta` (line 112), merge the source row's rig signal so `classifyRig` is correct. Select `a.source_meta` in the source query (lines 48-56) and carry `is_rigged`, `skeleton_joint_count`, `auto_rigged` (only the keys that exist on the source) into the new `source_meta` alongside `forked_from`. Do NOT carry `unrigged_storage_key` / `rig_job_id` (those point at the source owner's objects).
   *Acceptance:* Forking a rigged avatar produces a fork whose `classifyRig().category === 'rigged'`; forking a static avatar produces `'static'`; forking an uninspected avatar produces `'unknown'`. Covered by the new test.

3. **Forking a still-static avatar kicks auto-rig for the fork.**
   After the fork row + its agent are created, call `maybeAutoRigAvatar({ userId: auth.userId, avatar, rigInfo: { is_rigged: <source rigged>, skeleton_joint_count: <source joints> }, source: 'fork' })` (best-effort, after `recordEvent`). When the source is rigged this no-ops (`already_rigged`); when static it submits a `rerig` job so the fork becomes animation-ready like every other creation path. Use the carried rig signal from requirement 2 to compute `rigInfo` — do NOT re-fetch/re-inspect the GLB (the fork is a byte-identical copy).
   *Acceptance:* Forking a static avatar (with a rerig model configured) inserts one `rerig`/`auto_rig` job for the FORK's id; forking a rigged avatar inserts none. Covered by the new test.

4. **Never copy a `rigged` tag onto a fork with no rig signal.**
   When the source's carried rig signal is NOT rigged (`rigInfoIsRigged` from `auto-rig.js` returns false on the carried signal), strip any `rigged` tag from the copied `tags` array before insert, so a fork never shows a `rigged` badge it can't back up. Keep all other tags. Conversely, when the carried signal IS rigged, preserve the `rigged` tag.
   *Acceptance:* Forking a static-but-`rigged`-tagged source yields a fork whose `tags` excludes `rigged`. Covered by the new test.

5. **`handleRegenerate` dedupes in-flight rerig jobs (409 + existing jobId).**
   In `api/avatars/_actions.js`, before submitting (after the source-row load at line 376, gated to `mode === 'rerig'`), run an in-flight query mirroring `auto-rig.js` lines 108-116 — but match ANY in-flight `rerig` job for the avatar (auto OR manual), i.e. `where source_avatar_id = ${id} and mode = 'rerig' and status in ('queued','running','rigging')`. If one exists, return `409` with body `{ ok: false, error: 'rig_in_flight', error_description: '…', jobId: <existing job_id>, status: <existing status> }`. Only dedupe `rerig`; other modes (remesh/retex/restyle/reconstruct) are unaffected.
   *Acceptance:* Two back-to-back `rerig` POSTs for the same avatar: the first returns `202` with a new jobId, the second returns `409` carrying the SAME jobId. A `remesh` POST is never deduped. Covered by the new test.

6. **Manual rig panel attaches to the in-flight job on 409.**
   In `src/avatar-rig.js` `startRigging` (lines 95-110), when `res.status === 409` and `body.jobId` is present, do not show an error: set `jobId = body.jobId`, transition to the `rigging` phase with a message like "Already rigging this avatar — attaching to the existing job…", and call `pollUntilDone(jobId, Date.now())` so the panel rides the existing job to completion. Keep the existing 501 and generic error handling for all other non-OK responses.
   *Acceptance:* With an auto-rig job already queued for an avatar, opening the Animate tab and clicking rig attaches to that job (no duplicate submission, no error toast) and reaches the rigged result. Manually verified in the browser plus a unit test of the 409 branch if the panel logic is testable in isolation.

7. **Correct `is_rigged` provenance in `from-forge.js` and `save_avatar`.**
   In both, set `source_meta.is_rigged` to: `true` when rigged (forge `rigged` flag OR `info.isRigged === true`); `false` when the GLB was successfully inspected and confirmed static (`info` is a real inspection result AND `info.isRigged === false`); `null` only when inspection did not yield a rig verdict (`info.isRigged` is `undefined`/missing — e.g. `inspectGlb` returned `{}`). Implement as a small local helper, e.g. `resolveRiggedFlag(forgeRigged, info)`, used in both files (or duplicated — they live in different module trees; a 5-line pure function in each is acceptable, do not create a shared import just for this unless one already fits). For `save_avatar` there is no `rigged` input arg, so `forgeRigged` is effectively `false`.
   *Acceptance:* A from-forge save of a confirmed-static GLB stores `source_meta.is_rigged === false` (not `null`), and `classifyRig` returns `'static'`. A save where `inspectGlb` returned `{}` stores `null` and classifies `'unknown'`. Covered by the new test.

8. **Changelog entry.**
   Add one `data/changelog.json` entry (tag `fix` or `improvement`) in holder-readable language — e.g. "Avatars saved from the studio, forked, or generated by agents now reliably become animation-ready, and re-rigging an avatar that's already rigging no longer starts a duplicate job." Run `npm run build:pages`.
   *Acceptance:* `npm run build:pages` succeeds and regenerates `CHANGELOG.md` / `public/changelog.*` with the new entry.

## Implementation notes

- **Mirror `from-forge.js`, do not diverge.** It is the canonical wiring. The order is: `createAvatar` → schedule `provisionAvatarAgent` → schedule `maybeAutoRigAvatar` → `recordEvent` → respond. Keep that order so behavior is identical across the HTTP and MCP twins.
- **`maybeAutoRigAvatar` is self-guarding and never throws** (auto-rig.js lines 85-147): it already checks `rigInfoIsRigged`, provider availability (`supportsMode('rerig')`), and its own in-flight dedupe. You do not need to re-check those at the call sites — just pass an accurate `rigInfo`.
- **`rigInfoIsRigged(rigInfo)`** (exported from `auto-rig.js`, lines 41-46) is the exact predicate to reuse for requirement 4's tag-stripping decision — import it rather than re-deriving the rigged test.
- **MCP handler lifetime:** unlike the `wrap()`-ed HTTP handlers that can lean on `queueMicrotask`, the MCP tool returns a value the transport serializes; background microtasks may be cut off when the function returns and the lambda freezes. `await` the provisioning/rig calls. They are fast (they only submit a job / insert a row, not wait for rigging to finish).
- **Fork rig signal source:** read it from the row you already `select` — add `a.source_meta` to the fork's source query (it currently selects `appearance`, `model_category`, etc. but you must confirm `source_meta` is included; add it if not). Compute `{ is_rigged, skeleton_joint_count }` from `src.source_meta` for the `maybeAutoRigAvatar` call.
- **Dedupe scope:** the auto-rig in-flight guard filters on `(params->>'auto_rig') = 'true'`; the manual `handleRegenerate` guard must NOT include that filter — it must catch BOTH auto and manual in-flight rerigs (a manual rig should also block a second manual rig, and should attach to an in-flight auto-rig). Match only on `source_avatar_id`, `mode='rerig'`, and `status`.
- **Status values:** the in-flight statuses are `'queued','running','rigging'` (see auto-rig.js line 113). Use the same set.
- **Do not log secrets.** Provisioning/rig failures log `err?.message` only, as the existing code does.

## Verification

```bash
# Confirm the wiring is present (no longer missing)
grep -n "provisionAvatarAgent\|maybeAutoRigAvatar" api/_mcp3d/tools/studio.js   # both must appear
grep -n "rig_in_flight\|source_avatar_id = \|status in ('queued'" api/avatars/_actions.js
grep -n "source_meta\|maybeAutoRigAvatar\|rigInfoIsRigged" api/avatars/fork.js

# Guard against the esbuild-bundle trap before any commit
head -1 api/avatars/fork.js api/avatars/_actions.js api/_mcp3d/tools/studio.js   # must NOT be __defProp/createRequire

# Tests
npm test                          # full suite stays green
npm test -- fork                  # the new fork rig-provenance + auto-rig + tag tests
npm test -- regenerate            # the new in-flight dedupe test
npm test -- save_avatar           # or the studio tool test file you add to

# Changelog
npm run build:pages               # must succeed and validate the new entry
```

Manual checks:
- In a browser, open an avatar's editor "Animate" tab while an auto-rig job is in flight for it (e.g. right after a from-forge/studio save of a static GLB). Clicking rig must attach to the existing job (no second job in `avatar_regen_jobs`, no error toast) and reach the rigged result. Verify in DevTools Network: the `/api/avatars/regenerate` call returns `409` with a `jobId`, then `/api/avatars/regenerate-status` polls that same id.
- Fork a static avatar that carries a `rigged` tag; confirm the fork's badge does not show "Rigged" and a `rerig` job exists for the fork.
- Fork a rigged avatar; confirm the fork shows "Rigged", carries the rig `source_meta`, and NO rerig job was submitted.
- Confirm no new console errors/warnings from your code.

## Definition of done

- [ ] `save_avatar` imports and calls `provisionAvatarAgent` + `maybeAutoRigAvatar`, mirroring `from-forge.js`; verified by grep + test.
- [ ] `fork.js` carries rig `source_meta`, auto-rigs still-static forks, and never copies a `rigged` tag onto an unrigged fork.
- [ ] `handleRegenerate` returns `409` + existing `jobId` for an in-flight `rerig`; `remesh`/others unaffected.
- [ ] `src/avatar-rig.js` attaches to the in-flight job on `409` instead of erroring.
- [ ] `from-forge.js` and `save_avatar` store `is_rigged` as `false` (inspected-static) / `null` (uninspected) / `true` (rigged) correctly.
- [ ] New tests cover all five paths and pass; `npm test` is fully green.
- [ ] Changelog entry added; `npm run build:pages` succeeds.
- [ ] `head -1` of every changed `api/*.js` is real source (not an esbuild bundle); `git diff` self-reviewed; staged by explicit path.
- [ ] No console errors/warnings from your code; you'd demo this to senior engineers.

## Out of scope / follow-ups

- **Sibling materialization** (`01-sibling-materialization.md`): if not yet landed, this prompt wires against the live in-place model. When 01 lands, re-confirm these call sites still produce a sibling correctly — no rework expected since they only submit jobs.
- **Cron rescue + rig cache/backfill** (`06-rig-cache-and-backfill.md`): the jobs these paths now submit are what the cron rescues; backfilling avatars created before this fix lives there.
- **Cost & consent gates** (`04-cost-and-consent-gates.md`): whether auto-rig should be gated by cost/consent on the fork/studio paths is decided there, not here.
- **Completion state machine** (`02-completion-statemachine.md`) and **observability/events** (`08-observability-and-events.md`): the lifecycle/status transitions and event emission for these new jobs are owned by those prompts.
