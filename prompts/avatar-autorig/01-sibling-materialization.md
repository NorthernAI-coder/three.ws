# Convert auto-rig from in-place swap to sibling-materialization (keystone refactor)

> One-line: "Paste this into a fresh Claude Code chat at the repo root and execute it fully."

## Operating rules (non-negotiable)
- You are building **three.ws** — a platform meant to compete with the best in the world. Senior-engineer bar: no shortcuts, ship complete polished work.
- **No mocks, no fake data, no placeholders, no TODO comments, no stub functions, no `throw new Error("not implemented")`, no fake setTimeout loading.** Real APIs, real endpoints, real wiring only. If credentials are missing, locate them in `.env` / `vercel env`, else proceed with the real integration.
- **$THREE is the ONLY coin** this platform may reference. Contract: `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name, import, hardcode, or recommend any other token anywhere (code, tests, fixtures, copy, commits). If you find another coin referenced, remove it.
- **Concurrent agents share this worktree.** Stage explicit paths only (never `git add -A`/`git add .`); re-check `git status` and `git diff --staged` immediately before any commit.
- **Changelog:** every user-visible change gets an entry in `data/changelog.json` (date, holder-readable title + summary, tags from feature|improvement|fix|sdk|infra|docs|security); then run `npm run build:pages`. Internal-only chores get no entry.
- **Push to BOTH remotes when asked to push:** `git push threeD main` AND `git push threews main`. NEVER pull/fetch/merge from `threeD` (push-only mirror); pulls come from `threews` only.
- **Trap:** `npx vercel build` overwrites `api/*.js` with esbuild bundles — before committing an `api/` diff, check `head -1` for `__defProp`/`createRequire` and `git restore -- api/ public/` if contaminated.
- **Definition of done:** code wired + reachable in the UI; every state designed (loading/empty/error/populated/overflow); no console errors/warnings from your code; real API calls verified; existing tests pass (`npm test`); `git diff` self-reviewed; you'd demo it proudly to senior engineers.
- Read `CLAUDE.md` and `STRUCTURE.md` first. Use TodoWrite for 3+ step tasks. Keep communication short.

## Context

When a static (skeleton-less) avatar is uploaded, imported, or saved from the forge/chat flow, three.ws auto-rigs it into an animation-ready model so the agent that owns it can walk, wave, and emote. Today that completion step (`finalizeAutoRigStage` in `api/_lib/auto-rig.js`) **mutates the existing avatar row in place** — it writes the rigged GLB to a new R2 key, then overwrites `storage_key`, `size_bytes`, `source_meta`, and `tags` on the *same* `avatars.id`.

That in-place swap is the root of a class of data-integrity bugs because several other systems treat an avatar row as an *immutable, content-addressed* artifact keyed by its `id`:

- **Attestations** (`src/attestations/gltf.js`) bind an on-chain signature to a specific `glbSha256`. The in-place swap changes the bytes under a row whose `checksum_sha256` / `storage_mode.attestation.hash` still describe the *old* static mesh — the attestation now verifies against bytes that no longer exist at that id.
- **IPFS pins** (`storage_mode.ipfs`) point a CID at the static bytes. After the swap, the row claims `primary`/`r2.key` is the rigged GLB while `ipfs.cid` silently still resolves to the orphaned static mesh.
- **The id-keyed GLB proxy** (`api/avatars/[id]/[action].js`, GET `glb`) serves bytes with `cache-control: public, max-age=300, s-maxage=86400, immutable` on the premise that "rotation produces a new key." The in-place swap violates that premise for any embed/CDN that fetched the old immutable bytes by id.
- There is **no `avatar_versions` trail** and no provenance row for the upgrade, so rigging is not reversible and the lineage is invisible.

The reconstruct pipeline (`api/_lib/reconstruct-finalize.js`) already solved this correctly: its `materializeReconstructAvatar` always calls `createAvatar(...)` to mint a **new** row for the rigged result. And `POST /api/avatars` (`api/avatars/index.js`) already knows how to **re-point** an `agent_identities` row from a parent avatar to a freshly-created child when `parent_avatar_id` is supplied. This task makes auto-rig adopt that same sibling-materialization model, which is the keystone that dissolves all four bugs at once. Getting avatar provenance right is table-stakes for a platform that wants to mint on-chain agents and sell rigged avatars — a $1B bar cannot have "the bytes under this id silently changed" anywhere in the data model.

## Objective

Replace the in-place `storage_key` mutation in `finalizeAutoRigStage` with **sibling-materialization**: the rigged GLB becomes a **new avatar row** (parent = the static source), the owning agent identity (and any other references) re-point from the static avatar to the rigged one, all storage-integrity fields (`checksum_sha256`, `storage_mode`, IPFS pin state) are recomputed/marked correctly on the new row, an `avatar_versions` trail makes the upgrade reversible, and the original static avatar survives untouched so a rigging failure can never lose the user's avatar.

## Background findings

Confirmed by reading the code:

- `api/_lib/auto-rig.js:158` `finalizeAutoRigStage({ userId, jobId, job, glbUrl })` — the in-place swap. Lines `223–234` run `update avatars set storage_key = ${newKey}, size_bytes, source_meta, tags, usdz_key=null, halfbody_key=null, baked_storage_key=null where id = ${avatarId}`. It never recomputes `checksum_sha256`, never touches `storage_mode`, never writes `avatar_versions`, and returns `{ status: 'done', resultAvatarId: avatarId }` (the **same** id it was handed). The deleted/missing-avatar branch (`:178`) returns `{ status:'done', resultAvatarId: avatarId }` and a "no avatar/glbUrl" branch (`:167`) returns `{ status:'done' }`.
- `api/_lib/reconstruct-finalize.js:54` `materializeReconstructAvatar(...)` — the pattern to mirror: it canonicalizes bones, `putObject(...)`, then `createAvatar({ userId, storageKey, input: { slug, name, ..., checksum_sha256: null, parent_avatar_id: null, source_meta, tags } })`, marks the job `result_avatar_id = avatar.id`, and fires an `avatar.created` webhook. Note it passes `checksum_sha256: null` today — you will compute a real hash for the rig sibling.
- `api/_lib/avatars.js:106` `createAvatar({ userId, input, storageKey })` enforces quotas, generates a slug, builds `storage_mode` via `defaultStorageMode({ storage_key, checksum_sha256 })`, and inserts the row. `:554` `storageKeyFor({ userId, slug })` returns `u/<userId>/<slug>/<ts>.glb`. `:411` `_servedStorageKey` and `:391` `resolveAvatarUrl` decide which key is served.
- `api/_lib/storage-mode.js:35` `defaultStorageMode(avatarRow)` seeds `r2.key = storage_key`, `attestation.hash = checksum_sha256`, `ipfs.pinned = false`. `:50` `readStorageMode(avatarId)` deep-merges the stored JSONB over the default.
- `api/avatars/index.js:130–138` — the canonical agent re-point: `update agent_identities set avatar_id = ${avatar.id} where user_id = ... and avatar_id = ${parent_avatar_id} and deleted_at is null`. `:88–95` validates `parent_avatar_id` ownership.
- `api/avatars/[id]/[action].js:163` `handlePinIpfs` reads `checksum_sha256, storage_key` and writes `storage_mode.ipfs`. `:639` the GLB proxy serves `storage_key`/baked key with the `immutable` cache header at `:656`.
- `api/avatars/[id].js:202` `handleGlbPatch` is the existing model for an `avatar_versions` insert: `insert into avatar_versions (avatar_id, storage_key, created_by) values (...)`, wrapped in a try/catch that no-ops on `42P01` / "does not exist" (the table may not be migrated on all envs). Reuse this exact defensive pattern.
- `src/attestations/gltf.js:96` `verifyGlTFAttestation` recomputes `sha256Hex(glbBlob)` and compares to `attestation.glbSha256` — this is why the new row must carry the **rigged** bytes' hash.
- Callers of `finalizeAutoRigStage` (all must accept the new return shape, keep idempotency):
  - `api/webhooks/replicate.js:238`
  - `api/avatars/_actions.js:538` (regenerate-status poll; sets `job.result_avatar_id = result.resultAvatarId`)
  - `api/cron/auto-rig-sweep.js:120`
- `maybeAutoRigAvatar` (`api/_lib/auto-rig.js:85`) submits the job with `sourceAvatarId: avatar.id` and an idempotency guard (`:108`) on `source_avatar_id + mode='rerig' + params.auto_rig='true' + status in (queued,running,rigging)`. The job's `source_avatar_id` is the static avatar id — that becomes the **parent** of the sibling.

## Scope — in / out

**In:**
- Rewrite `finalizeAutoRigStage` in `api/_lib/auto-rig.js` to materialize a sibling avatar row instead of mutating in place.
- Recompute `checksum_sha256` for the rigged bytes; ensure `storage_mode` on the sibling is correct (R2 key + attestation hash); mark/clear IPFS state so no orphaned pin is implied.
- Re-point `agent_identities` from the static avatar to the sibling (mirror `api/avatars/index.js`).
- Write an `avatar_versions` trail row so the rig is reversible (mirror `api/avatars/[id].js`).
- Update the three callers to the new return shape; preserve idempotency (no duplicate siblings on webhook+poll+cron racing the same job).
- Preserve the fail-soft contract: the static avatar must remain a valid, owned, animatable-via-fallback avatar if anything fails.
- Add/extend a unit test under `tests/` covering the new behavior.
- Changelog entry (this is user-visible: rigged avatars now appear as a distinct, attested, reversible model).

**Out (defer — see "Out of scope / follow-ups"):**
- The deep CDN/edge purge of already-cached id-keyed GLB bytes (cache-busting strategy for the proxy) — at minimum the sibling has a new id **and** a new R2 key, which is sufficient here.
- The auto-rig **frontend/library UX** (how the gallery renders parent→rigged lineage, "view original" affordance).
- Real Pinata re-pin orchestration of the rigged bytes (here you only mark the inherited pin stale / leave the sibling unpinned; a follow-up prompt can auto-pin rigged siblings).
- Changing `maybeAutoRigAvatar` submission/gating logic.

## Key files & entry points

- `api/_lib/auto-rig.js` — `finalizeAutoRigStage` (rewrite), `maybeAutoRigAvatar` (unchanged), `canonicalize`, `fetchGlbBuffer` helpers.
- `api/_lib/reconstruct-finalize.js` — `materializeReconstructAvatar`: the sibling pattern to mirror (createAvatar + job marking + webhook).
- `api/_lib/avatars.js` — `createAvatar`, `storageKeyFor`, `defaultStorageMode` usage; quota enforcement.
- `api/_lib/storage-mode.js` — `defaultStorageMode`, `readStorageMode`, `storageModeSchema` (validate any storage_mode you write).
- `api/avatars/index.js` (`:130`) — canonical `agent_identities` re-point on `parent_avatar_id`.
- `api/avatars/[id].js` (`:202`) — canonical `avatar_versions` insert with `42P01` guard.
- `api/avatars/[id]/[action].js` — `handlePinIpfs` (`:163`), GLB proxy + immutable cache header (`:639`/`:656`).
- `src/attestations/gltf.js` (`:96`) — why the rigged bytes need their own hash.
- Callers: `api/webhooks/replicate.js:238`, `api/avatars/_actions.js:538`, `api/cron/auto-rig-sweep.js:120`.
- `tests/` — find the existing auto-rig / reconstruct-finalize test (`grep -rl "finalizeAutoRigStage\|materializeReconstructAvatar\|auto-rig" tests`) and extend it.

## Requirements

Each requirement has an **acceptance criterion (AC)**.

1. **Materialize a sibling row, not an in-place swap.** In `finalizeAutoRigStage`, after fetching + canonicalizing the rigged GLB and `putObject`-ing it to a fresh key (`storageKeyFor`, slug `rigged-XXXXXX`), call `createAvatar({ userId, storageKey: newKey, input: {...} })` to mint a NEW row whose `parent_avatar_id` is the static source avatar id. Do **not** run `update avatars set storage_key = ...` on the source row.
   - **AC:** After completion the source avatar's `storage_key`, `size_bytes`, `checksum_sha256`, `source_meta`, and `storage_mode` are byte-for-byte unchanged from before the job; a new `avatars` row exists with `parent_avatar_id = <sourceId>`, `source = 'auto-rig'` (or equivalent provenance), tags including `rigged` and excluding `unrigged`, and `source_meta.is_rigged = true`.

2. **Carry the static avatar's identity onto the sibling.** The sibling inherits a sensible `name` (e.g. the source's name, or the source name unchanged), `description`, and `visibility` from the source row so the user's library doesn't show a renamed mystery avatar. Copy forward relevant `source_meta` provenance: `unrigged_avatar_id = <sourceId>`, `unrigged_storage_key = <source.storage_key>`, `auto_rigged: true`, `rig_provider: 'auto-rig'`, `rig_job_id: jobId`, plus the inspected skeleton stats (`skeleton_joint_count`, `skin_count`, `node_count`, `animation_count`) from `inspectGlb`.
   - **AC:** Reading the sibling via `getAvatar` returns the same `visibility` as the source and a `source_meta.unrigged_avatar_id` equal to the source id; the source row's own `source_meta` is unchanged.

3. **Recompute `checksum_sha256` for the rigged bytes.** Compute `createHash('sha256').update(glbBuf).digest('hex')` on the canonicalized rigged buffer and pass it as `input.checksum_sha256` to `createAvatar`. (Do **not** reuse the `_hashAppearance` canonical-JSON hash — that is for appearance, not GLB bytes.)
   - **AC:** The sibling row's `checksum_sha256` equals the sha256 of the exact bytes written to R2; `defaultStorageMode` therefore stamps `attestation.hash` to that same hash (verify via `readStorageMode(siblingId)`).

4. **`storage_mode` on the sibling is correct and schema-valid.** Because `createAvatar` builds `storage_mode` from `defaultStorageMode({ storage_key: newKey, checksum_sha256 })`, the sibling automatically gets `primary:'r2'`, `r2.key = newKey`, `r2.present:true`, `attestation.hash = <rigged sha256>`, and `ipfs.pinned:false`. Confirm this and validate it with `validateStorageMode` (from `storage-mode.js`) before/after if you construct any storage_mode by hand.
   - **AC:** `validateStorageMode(await readStorageMode(siblingId))` does not throw; `r2.key === newKey`; `ipfs.pinned === false` (the sibling starts unpinned — no inherited/orphaned CID).

5. **No silently-orphaned IPFS pin.** The static source may already be IPFS-pinned (`storage_mode.ipfs.pinned = true` → a CID for the static bytes). The sibling must **not** inherit that CID (its bytes differ). If the source was pinned, stamp the source's `storage_mode` (or the sibling's `source_meta`) with a marker that the static pin is now superseded — e.g. set `source.source_meta.rigged_superseded_by = <siblingId>` so a future re-pin job / the UI can detect the rigged version exists. Do not call Pinata here (that's a follow-up).
   - **AC:** The sibling's `storage_mode.ipfs.cid` is `null`; if the source had `ipfs.pinned`, the source row carries a marker pointing to the sibling. No row claims a CID for bytes it does not hold.

6. **Write an `avatar_versions` trail.** Insert a version row recording the rig upgrade, mirroring `api/avatars/[id].js:240` including the `42P01`/"does not exist" guard so it no-ops on un-migrated envs. Record enough to reverse the rig: at minimum `avatar_id` = source id (or sibling id — pick one and document it in a comment), `storage_key` of the rigged GLB, and `created_by = userId`. If the table supports more columns (check `grep -rn "avatar_versions" migrations/ db/ sql/`), populate them.
   - **AC:** After a successful finalize an `avatar_versions` row exists referencing the rigged `storage_key`; on an env without the table the finalize still succeeds (warning logged, no throw).

7. **Re-point the owning agent identity to the sibling.** Mirror `api/avatars/index.js:130–138`: `update agent_identities set avatar_id = <siblingId> where user_id = <userId> and avatar_id = <sourceId> and deleted_at is null`. The agent keeps its `id`, wallet, chain id, and ERC-8004 id — only its avatar pointer moves to the now-animatable model.
   - **AC:** An agent that pointed at the source avatar points at the sibling after finalize; its `id` and wallet are unchanged. If no agent pointed at the source, the update affects 0 rows and finalize still succeeds.

8. **Mark the job done with the sibling id.** `update avatar_regen_jobs set result_avatar_id = <siblingId>, status = 'done'` for `job_id + user_id`. Return `{ status: 'done', resultAvatarId: <siblingId> }`.
   - **AC:** The job row's `result_avatar_id` is the **sibling** id (not the source id); the function return value matches.

9. **Idempotency across racing callers.** The webhook (`replicate.js`), the poll (`_actions.js`), and the cron sweep (`auto-rig-sweep.js`) can each fire `finalizeAutoRigStage` for the same job. A second invocation must NOT create a second sibling. Before materializing, check the job row: if it already has `result_avatar_id` set (and status `done`), short-circuit and return `{ status:'done', resultAvatarId: <existing> }`. Re-read the job inside the function (don't trust a possibly-stale `job` arg) or guard the create with the existing `result_avatar_id`.
   - **AC:** Calling `finalizeAutoRigStage` twice with the same `jobId` yields exactly one sibling row and the same `resultAvatarId` both times.

10. **Fail-soft: the static avatar is never lost.** Every early-return / error branch must leave the source avatar valid and owned. The existing branches — source deleted between submit and completion (`:178`), missing `avatarId`/`glbUrl` (`:167`) — must be preserved (no sibling, job closed, no throw into the caller). A fetch/canonicalize/putObject failure must not delete or mutate the source row.
    - **AC:** If `glbUrl` is unreachable, `finalizeAutoRigStage` rejects or returns without having altered the source avatar; the source avatar still resolves and animates via the canonical-clip fallback (`AnimationManager.supportsCanonicalClips()`), exactly as before auto-rig existed.

11. **Update all three callers to the new return shape.** `replicate.js:238`, `_actions.js:538`, `auto-rig-sweep.js:120` already consume `{ status, resultAvatarId }`. Verify each correctly surfaces the **sibling** id (e.g. `_actions.js` sets `job.result_avatar_id = result.resultAvatarId`). The regenerate-status poll response (`_actions.js:545`) must report the sibling id as `resultAvatarId` so the browser navigates to the rigged avatar.
    - **AC:** `grep`-verify no caller assumes `resultAvatarId === source_avatar_id`; the poll/webhook responses carry the sibling id.

12. **Fire the `avatar.created` webhook for the sibling.** Mirror `materializeReconstructAvatar` (`reconstruct-finalize.js:127`): `dispatchWebhooks({ userId, eventType:'avatar.created', data:{ id, name, slug, source:'auto-rig' } }).catch(()=>{})`.
    - **AC:** A configured webhook receives one `avatar.created` event for the sibling on finalize.

13. **Quota awareness.** `createAvatar` calls `enforceQuotas`, which can throw `402 plan_limit_count` / `plan_limit_storage`. A rig completion must not hard-fail and leave the job stuck if the user is at quota. Catch the quota error, leave the source avatar intact, mark the job `done` (or a terminal state your callers already handle) with a `source_meta`/job note explaining the rigged sibling couldn't be created due to quota, and return without throwing.
    - **AC:** With a user at `max_avatars`, finalize completes without throwing, no sibling is created, the source avatar is untouched, and the job reaches a terminal state (not stuck in `rigging`/`running`).

14. **Changelog.** Add a `data/changelog.json` entry (tag `improvement` or `fix`): plain-language "Auto-rigged avatars now keep your original as a separate, attested, reversible model" framing. Run `npm run build:pages`.
    - **AC:** `npm run build:pages` passes and regenerates `CHANGELOG.md` / `public/changelog.json` / `public/changelog.xml` with the new entry.

## Implementation notes

- **Mirror, don't fork.** `materializeReconstructAvatar` already does canonicalize → `putObject` → `createAvatar` → mark job → `dispatchWebhooks`. Lift that exact ordering. The only deltas for auto-rig: `parent_avatar_id` is the **source** avatar id (not `null`), `checksum_sha256` is a real hash (not `null`), tags carry `rigged`, and you also re-point `agent_identities` + write `avatar_versions`.
- **Hash the bytes, not appearance.** Use `import { createHash } from 'node:crypto'` and hash the canonicalized `glbBuf` (the same buffer you `putObject`). Do this *after* `canonicalize(glbBuf)` so the hash matches the stored bytes.
- **Re-read the job for idempotency.** `select result_avatar_id, status from avatar_regen_jobs where job_id=${jobId} and user_id=${userId}` at the top; if `result_avatar_id` is non-null, return it. This closes the webhook/poll/cron race without a new lock.
- **Read the source row once** (the existing `select id, slug, storage_key, source_meta, tags from avatars where id=${avatarId} ...` at `auto-rig.js:172`) and additionally select `name, description, visibility, checksum_sha256, storage_mode` so you can carry identity forward and detect a prior IPFS pin.
- **`storage_mode`** is set for you by `createAvatar` → `defaultStorageMode`. Only construct one by hand if you need to mark the *source* as superseded; if you do, run it through `validateStorageMode` first.
- **`avatar_versions` columns:** confirm the real schema before inserting (`grep -rn "avatar_versions" migrations db sql` and inspect the live table if reachable). Stick to the columns `api/avatars/[id].js` already writes (`avatar_id, storage_key, created_by`) unless you confirm more exist.
- **Gotcha — `npx vercel build`:** never run it casually; it rewrites `api/*.js` into esbuild bundles. If you see `__defProp`/`createRequire` at the top of a changed `api/` file, `git restore -- api/ public/`.
- **Gotcha — concurrent agents:** other agents may edit `api/_lib/*` on `main`. Stage explicit paths only; re-check `git diff --staged` before committing.
- **Keep `finalizeAutoRigStage` async-pure** of UI concerns; it's shared by a webhook, a cron, and a poll. No `res`/HTTP in it.

## Verification

Run, in order:

1. `npm test` — full suite must stay green. Run the targeted test you extended: `npx vitest run tests/<auto-rig-or-reconstruct>.test.js` (locate it via `grep -rl "finalizeAutoRigStage\|auto-rig" tests`).
2. **New/extended unit test** must assert: (a) source avatar row unchanged after finalize; (b) sibling row created with `parent_avatar_id = source`, real `checksum_sha256`, `tags` includes `rigged`; (c) `agent_identities.avatar_id` moved from source to sibling; (d) double-finalize yields one sibling (idempotency); (e) job `result_avatar_id` = sibling id; (f) a `glbUrl`-fetch failure leaves the source intact. Use the project's existing DB/test harness (check how the current auto-rig/reconstruct test stubs `sql`, `putObject`, `getRegenProvider`, `fetch`).
3. `node -e "import('./api/_lib/storage-mode.js').then(m=>console.log(m.validateStorageMode(m.defaultStorageMode({storage_key:'u/x/y/z.glb',checksum_sha256:'a'.repeat(64)}))))"` — sanity-check the storage_mode you'll produce passes the schema.
4. **Manual end-to-end** (if a rerig model is configured in `.env` / `vercel env`, i.e. `REPLICATE_RERIG_MODEL`): `npm run dev`, upload a static GLB through the UI, watch the regenerate-status poll (`api/avatars/_actions.js`) flip to `done`, and confirm in the network tab the response carries a **new** `resultAvatarId` distinct from the uploaded avatar id. Open both rows: the original is still present and static; the sibling is rigged and the agent now points at it.
5. `git diff` self-review — every changed line justified; confirm no in-place `update avatars set storage_key` remains in `finalizeAutoRigStage`; confirm no other coin/token introduced anywhere.
6. `head -1 api/_lib/auto-rig.js` (and any other changed `api/*.js`) — must be source, not `__defProp`/`createRequire`.

## Definition of done

- [ ] `finalizeAutoRigStage` materializes a sibling via `createAvatar` (parent = source); the in-place `storage_key` swap is gone.
- [ ] Sibling carries real `checksum_sha256`, valid `storage_mode` (r2.key + attestation.hash correct, `ipfs.cid = null`), correct rig tags/`source_meta`.
- [ ] Source avatar row is provably unchanged on success and on every failure branch (fail-soft preserved).
- [ ] No orphaned IPFS pin: sibling unpinned, source marked superseded if it was pinned.
- [ ] `avatar_versions` trail written (with `42P01` guard); rig is reversible.
- [ ] `agent_identities` re-pointed source → sibling (id/wallet unchanged).
- [ ] Idempotent across webhook + poll + cron (one sibling, same `resultAvatarId`).
- [ ] All three callers (`replicate.js`, `_actions.js`, `auto-rig-sweep.js`) verified against the new return shape; sibling id surfaced to the browser.
- [ ] Quota-exceeded path is graceful (job terminal, source intact, no throw).
- [ ] `avatar.created` webhook fired for the sibling.
- [ ] Unit test extended and passing; `npm test` green.
- [ ] `data/changelog.json` entry added; `npm run build:pages` passes.
- [ ] `git diff` self-reviewed; no esbuild contamination; no non-$THREE token anywhere.

## Out of scope / follow-ups

- **CDN/edge purge of stale id-keyed GLB bytes** for embeds that already cached the source by id (the `immutable` proxy header at `api/avatars/[id]/[action].js:656`). The sibling's new id + new R2 key is sufficient for this prompt; the deep cache-busting fix is a deferred follow-up (tracked in `00-README.md`).
- **Auto-pin the rigged sibling to IPFS** (real Pinata orchestration of the rigged bytes + re-attestation). Here we only avoid the orphan; wiring the re-pin is a deferred follow-up (tracked in `00-README.md`).
- **Gallery/library UX for parent→rigged lineage** ("view original", lineage badge, dedupe in the grid) — deferred frontend follow-up (tracked in `00-README.md`).
