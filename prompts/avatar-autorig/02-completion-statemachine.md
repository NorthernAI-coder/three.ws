# Fix the auto-rig completion state machine (orphaned `done`+`null` jobs, unconditional reaper, idempotent finalize)

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

Every avatar born on three.ws — a GLB upload, a URL import, a chat/MCP "text → 3D avatar" forge save — is supposed to become animation-ready. When a freshly-created static mesh has no skeleton, `maybeAutoRigAvatar` (`api/_lib/auto-rig.js`) fires a background `rerig` job tagged `auto_rig: true` and the rigged GLB is later swapped in place on the **same** avatar row. The agent the user already owns simply gains the ability to walk, wave, and emote.

There are three independent drivers that are supposed to carry that job to completion:
1. **The Replicate webhook** (`api/webhooks/replicate.js`) — instant, the happy path.
2. **The browser status poll** (`api/avatars/_actions.js`, the `regenerate-status` handler) — for browser flows that poll.
3. **The cron sweep** (`api/cron/auto-rig-sweep.js`, every 5 min per `vercel.json`) — the backstop for headless/MCP creations that never poll and for dropped webhooks.

In production this state machine has gaps that strand avatars as permanently static even though the rig succeeded at the provider. For headless MCP creations (which never poll) the cron is the **only** safety net, so any hole in it is a silent, unrecoverable failure — the exact opposite of the Avaturn-parity promise. This task closes every hole so that a rig that completes at the provider **always** lands on the avatar, no matter which driver fires, how many fire, or what fails mid-flight.

This is the auto-rig **lifecycle** task. The mesh→rig **gate** (when to rig at all) is a separate concern — see `01-...md` if present in `prompts/`. Do not re-open the gate logic here.

## Objective

Make the auto-rig job lifecycle eventually-consistent and crash-safe: a `rerig`/`auto_rig` job whose provider work succeeded is **always** finalized onto its source avatar — recovered even when finalize previously threw after the status flipped to `done`, recovered even under a full candidate backlog, and safe when the webhook, poll, and cron all finalize the same job concurrently.

## Background findings (verified against the code)

1. **Permanent-orphan bug — `done` + `result_avatar_id IS NULL` is invisible to every recovery driver.**
   In `api/webhooks/replicate.js`, the row is flipped to its terminal status **before** finalize runs:
   - lines 189–196 — the `update avatar_regen_jobs set status = ${nextStatus} …` runs unconditionally; for a succeeded prediction `nextStatus === 'done'`.
   - lines 237–242 — `finalizeAutoRigStage(...)` is then called inside a `try/catch` whose `catch` only `console.warn`s (line 240) and swallows the error.
   So if `finalizeAutoRigStage` throws (R2 write fails, provider GLB fetch 500s, DB hiccup), the job is left at `status = 'done'`, `result_avatar_id IS NULL`. Now look at who can recover it:
   - The cron candidate query (`api/cron/auto-rig-sweep.js` lines 65–76) filters `status in ('queued', 'running')` — it will **never** select a `done` row.
   - The browser poll (`api/avatars/_actions.js` lines 530–543) *could* re-finalize, but headless/MCP creations never poll.
   Result: the avatar is stranded static forever with no driver able to retry. This is the core bug.

2. **The MAX_AGE zombie reaper can be starved by a real backlog.**
   In `api/cron/auto-rig-sweep.js` the reaper (lines 80–95) is nested **inside `if (!rows.length)`** — it only runs on a tick where the candidate query (lines 65–76, `limit ${BATCH}` with `BATCH = 25`, line 34) returned **zero** rows. Under a sustained backlog of ≥25 quiet candidates, every tick fills the batch, `rows.length > 0`, and the reaper never executes — zombies older than `MAX_AGE` (`"6 hours"`, line 33) accrete indefinitely.

3. **Candidate ordering is correct but throughput may be thin.**
   The candidate query already does `order by updated_at asc` (line 74), oldest-quiet-first — good. But `BATCH = 25` every 5 minutes caps throughput at 300 jobs/hour; a burst of headless creations can outrun it. Throughput must exceed plausible inflow.

4. **The webhook re-fetches a GLB it already has, and the poll re-derives one it already stored.**
   `finalizeAutoRigStage` (`api/_lib/auto-rig.js` lines 158–237) takes a `glbUrl` and `fetchGlbBuffer`s it (line 185). The webhook already extracted the provider URL into `result_glb_url` at line 192. When the cron recovers a `done`+`null` job it has `result_glb_url` in hand and should **not** re-hit the provider's `status()` for a URL it already stored — re-fetching is wasted latency and an extra failure surface.

5. **Finalize is not guarded against concurrent runs.**
   `finalizeAutoRigStage` (lines 158–237) does read-then-write with no concurrency guard. The webhook, the poll, and the cron can all fire for one job in the same window. Two finalizers racing would each write a fresh rigged GLB to a new R2 key and each run `closeJob`, double-billing the provider fetch and orphaning one R2 object. There must be a single winner.

6. **Cron schedule:** `vercel.json` line ~3758 schedules `/api/cron/auto-rig-sweep` at `*/5 * * * *`.

## Scope — in / out

**In scope (touch these):**
- `api/cron/auto-rig-sweep.js` — un-nest the reaper, add a `done`+`null` recovery lane, raise throughput.
- `api/webhooks/replicate.js` — make the auto-rig branch not strand jobs at `done`+`null` (see Requirement 1 for the two allowed strategies).
- `api/_lib/auto-rig.js` — make `finalizeAutoRigStage` idempotent / concurrency-guarded, and let it reuse a stored `result_glb_url`.
- `api/avatars/_actions.js` — only if Requirement 1's chosen strategy changes the `done` transition contract the poll relies on (lines 530–543).
- `vercel.json` — cron schedule only if you shorten it (Requirement 3).
- `tests/` — new test file(s) per Requirement 6.
- `data/changelog.json` — one `fix` entry (user-visible: stranded avatars now self-heal).

**Out of scope (do NOT touch):**
- The mesh→rig **gate** decision (`rigInfoIsRigged`, `maybeAutoRigAvatar` submission logic) — separate prompt `01-...md`.
- The reconstruct pipeline finalize (`finalizeReconstructStage`, `api/_lib/reconstruct-finalize.js`) beyond what's structurally shared — do not refactor it.
- Webhook signature verification (`verifyStandardWebhook`, SSRF host pinning) — leave intact.
- Manual rig panel / client-side sibling materialization.
- Any coin/token references.

## Key files & entry points

- `api/_lib/auto-rig.js` — `maybeAutoRigAvatar` (submit) and **`finalizeAutoRigStage`** (lines 158–237, the shared completion stage that fetches/canonicalizes/stores the rigged GLB and swaps it in place; `closeJob` helper lines 160–165). Primary edit target for idempotency + url-reuse.
- `api/webhooks/replicate.js` — Replicate completion receiver. Status flip lines 189–196; auto-rig finalize branch lines 229–242 with the swallowed `catch` at 240.
- `api/cron/auto-rig-sweep.js` — the 5-minute backstop. `QUIET_WINDOW`/`MAX_AGE`/`BATCH` constants lines 30–34; candidate query lines 65–76; **reaper nested in `if (!rows.length)`** lines 80–95; per-job loop lines 107–144; `failJob` helper lines 51–57.
- `api/avatars/_actions.js` — the `regenerate-status` poll. Provider poll lines 460–493; auto-rig finalize branch lines 530–543.
- `vercel.json` — cron entry for `/api/cron/auto-rig-sweep` (~line 3758).
- `tests/auto-rig-gate.test.js` — existing gate test (do not modify; mirror its `vitest` style).
- `tests/agent-monetization.test.js` lines 18–33 — reference pattern for mocking `api/_lib/db.js`'s `sql` tagged template with a queue of canned result sets.

## Requirements

Each requirement has an acceptance criterion. All must hold.

### 1. Eliminate the permanent `done` + `result_avatar_id IS NULL` orphan
Choose **one** of these two strategies and implement it fully and consistently across all three drivers:

- **Strategy A (preferred — finalize owns the single `done` transition):** In `api/webhooks/replicate.js`, for the auto-rig case do **not** let the unconditional status update (lines 189–196) write `status = 'done'`. Instead, when an auto-rig job's prediction succeeded, persist the provider's `result_glb_url` and a non-terminal `status` (e.g. keep/restore `'running'`, or introduce a `'finalizing'` status), then call `finalizeAutoRigStage`, and let **`finalizeAutoRigStage`'s `closeJob` be the *only* writer of `status = 'done'`** (it already sets `status = 'done'` together with `result_avatar_id` atomically at lines 162–165). A finalize that throws then leaves the job at the non-terminal status, which the cron's existing `status in ('queued','running')` filter still selects. Apply the same "don't flip auto-rig jobs to `done` before finalize" rule to the poll path (`api/avatars/_actions.js` lines 472–479) so the three drivers share one contract. The reconstruct branch's behavior must be unchanged.
- **Strategy B (cron also sweeps the orphan tail):** Keep the early `done` flip, but add a **second candidate lane** to the cron (`api/cron/auto-rig-sweep.js`) that selects `mode = 'rerig' AND params->>'auto_rig' = 'true' AND status = 'done' AND result_avatar_id IS NULL` and finalizes them by reusing the stored `result_glb_url` (Requirement 4) — no provider `status()` call needed. This lane must also be subject to the `QUIET_WINDOW` so it never races a webhook finalize in progress.

**Acceptance:** A unit/integration test (Requirement 6a) drives a job to `status = 'done', result_avatar_id IS NULL` with a valid stored `result_glb_url`, runs the recovery driver once, and asserts the job ends `status = 'done', result_avatar_id = <source avatar id>` with the avatar's `storage_key` re-pointed and `source_meta.is_rigged === true`. With Strategy A, also assert that a finalize throw leaves the job at the **non-terminal** status (cron-selectable), never `'done'`+`null`.

### 2. Run the MAX_AGE reaper unconditionally every tick
In `api/cron/auto-rig-sweep.js`, move the reaper (currently lines 80–95) **out** of the `if (!rows.length)` block so it executes on **every** tick regardless of candidate count. The reaper's `update … set status = 'failed', error = '…' where … created_at <= now() - ${MAX_AGE}::interval` must run before, after, or alongside the candidate processing — but never be gated by a non-empty batch. Add `reaped` to the summary unconditionally.

**Acceptance:** Test 6b stubs the candidate query to return a full `BATCH` of rows (`rows.length === BATCH`) **and** stubs the reaper update to return ≥1 reaped row; after one handler invocation the response includes `reaped >= 1`, proving the reaper ran despite a full batch.

### 3. Make throughput exceed plausible inflow
Either raise `BATCH` (line 34) to a value that clears a realistic headless-creation burst within a couple of ticks (e.g. 100) **or** shorten the cron schedule in `vercel.json` (`*/5 * * * *` → a tighter interval), or both. Pick deliberately and justify the number in a code comment with the arithmetic (jobs/tick × ticks/hour vs. expected inflow). Keep candidate ordering `order by updated_at asc` (oldest-quiet-first, already at line 74) so no job starves under load.

**Acceptance:** The constant/schedule change is present, commented with the throughput arithmetic, and the candidate query still orders oldest-first. No magic number without a comment.

### 4. Reuse a delivered-but-unfinalized `result_glb_url`
When a recovery driver already has the provider GLB URL stored on the row (the webhook wrote it to `result_glb_url` at `api/webhooks/replicate.js` line 192), the cron recovery lane must finalize from that stored URL **without** calling `provider.instance.status()` again. Pass the stored `result_glb_url` straight into `finalizeAutoRigStage({ … glbUrl })`. Only fall back to a provider `status()` poll when `result_glb_url` is absent. `finalizeAutoRigStage` already accepts `glbUrl` (line 158) — no signature change needed there.

**Acceptance:** Test 4 (may be folded into 6a) asserts that when recovering a `done`+`null` job whose row carries `result_glb_url`, the provider's `status()` is **not** invoked (spy asserts zero calls) and finalize still completes.

### 5. Make `finalizeAutoRigStage` idempotent under concurrent drivers
Guard `finalizeAutoRigStage` (`api/_lib/auto-rig.js`) so that when the webhook, poll, and cron fire for the same `job_id` concurrently, exactly **one** materializes the avatar and the losers no-op cleanly. Implement a real DB-level claim, not an in-process lock (the three drivers are separate serverless invocations). Recommended: an atomic conditional claim at the top of finalize, e.g.
```
update avatar_regen_jobs
set status = 'finalizing', updated_at = now()
where job_id = ${jobId} and user_id = ${userId} and result_avatar_id is null
  and status <> 'finalizing'
returning job_id
```
If the claim returns zero rows, another driver already owns (or completed) this job — return early as a no-op (e.g. `{ status: 'done', skipped: 'in_progress' }`) without fetching the GLB or writing R2. The winner proceeds through fetch → canonicalize → R2 put → avatar update → `closeJob`. If the winner then **throws**, it must release the claim back to a cron-selectable status (don't leave it wedged at `'finalizing'` forever) — either reset to `'running'` in a `catch`/`finally`, or have the cron also treat a stale `'finalizing'` (older than `QUIET_WINDOW`) as a recovery candidate. Pick one and make it consistent with Requirement 1's status set.

**Acceptance:** Test 6c runs two `finalizeAutoRigStage` calls for the same job against the shared `sql` mock where only the first claim returns a row; asserts exactly one R2 `putObject` and one avatar `update` occur, the second call no-ops, and the job ends `done`+`result_avatar_id` set. A thrown winner leaves the job at a cron-selectable (non-`'done'`, non-wedged) status.

### 6. Tests proving the three guarantees
Add `tests/auto-rig-completion.test.js` (vitest, mirroring `tests/auto-rig-gate.test.js` style and the `sql` mock pattern in `tests/agent-monetization.test.js` lines 18–33). Stub `api/_lib/db.js`'s `sql` with a queued result-set fixture, stub `api/_lib/r2.js`'s `putObject`/`publicUrl`, and stub the regen provider where a driver would call it. Cover:
- **6a — done+null is recovered:** a `done`+`null` job with a valid `result_glb_url` is finalized to `done`+`result_avatar_id` by the recovery driver; provider `status()` not called (Req 4).
- **6b — reaper runs under backlog:** full `BATCH` of candidates **and** a stubbed reaper update returning rows ⇒ handler response carries `reaped >= 1` (Req 2).
- **6c — double-finalize is safe:** two concurrent finalizes ⇒ one winner, one no-op, single R2 write, job ends `done`+`result_avatar_id` (Req 5).

**Acceptance:** `npx vitest run tests/auto-rig-completion.test.js` passes; full `npm test` still green.

## Implementation notes

- **Mirror the existing close contract.** `closeJob` (`api/_lib/auto-rig.js` lines 160–165) already writes `result_avatar_id` + `status = 'done'` together. Keep that atomicity. Strategy A simply removes every *other* writer of `status = 'done'` for auto-rig jobs so `closeJob` is the sole one.
- **Don't break reconstruct.** The webhook (lines 204–223) and poll (lines 507–524) reconstruct branches must keep behaving exactly as today. Only the `mode === 'rerig' && params.auto_rig === true` paths change. Gate every edit on that predicate.
- **Status vocabulary.** The codebase already uses `'queued' | 'running' | 'rigging' | 'done' | 'failed'`. If you introduce `'finalizing'`, ensure the cron candidate query and the `regenerate-status` response handling tolerate it (it should read as "in flight", not terminal). Grep for every `status in (...)` and every `status === 'done'` on `avatar_regen_jobs` before you finalize the vocabulary so nothing else mis-buckets the new value.
- **SSRF guard stays.** When the cron recovery lane finalizes from a stored `result_glb_url`, that URL originated from the webhook which only stores it after `isAllowedResultUrl` passes (webhook lines 204–207). The cron does not need to re-validate, but do **not** loosen the webhook's host pin.
- **Reaper SQL is already correct** (lines 83–92) — you are only relocating it out of the `if`, not rewriting it. Keep `returning job_id` so `reaped` stays accurate.
- **`failJob` helper** (lines 51–57) is reusable for the unpollable/no-`ext_job_id` case (line 109–115) — don't duplicate it.
- **Provider resolution** is a single `getRegenProvider()` for all auto-rig jobs (cron lines 97–105) — no per-job key juggling. The `done`+`null` recovery lane (Req 4) shouldn't even need the provider when `result_glb_url` is present; resolve the provider lazily only if a candidate lacks the stored URL.
- **No esbuild contamination:** after editing `api/*.js`, run `head -1 api/webhooks/replicate.js api/cron/auto-rig-sweep.js api/_lib/auto-rig.js api/avatars/_actions.js` and confirm none start with `__defProp`/`createRequire`.

## Verification

Run, in order, and paste results into your final summary:

1. **Targeted tests:**
   ```
   npx vitest run tests/auto-rig-completion.test.js
   ```
   All three cases (6a/6b/6c) green.
2. **Full suite (no regressions):**
   ```
   npm test
   ```
   (or at minimum `npx vitest run` if Playwright deps are unavailable — say which you ran.)
3. **No bundle contamination:**
   ```
   head -1 api/webhooks/replicate.js api/cron/auto-rig-sweep.js api/_lib/auto-rig.js api/avatars/_actions.js
   ```
   None start with `__defProp`/`createRequire`.
4. **Manual cron smoke (real handler, local):** start the dev server (`npm run dev`), then invoke the cron with the real secret:
   ```
   curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/auto-rig-sweep | jq
   ```
   Confirm the JSON always includes `reaped` (proving the reaper ran) and `scanned`/`finalized`/`failed`/`pending`/`errored`. (If `CRON_SECRET` is absent locally, note the 503 `not_configured` is the correct fail-closed behavior and rely on the tests.)
5. **Diff review:** `git diff` every changed file; justify each line; confirm only the `rerig`/`auto_rig` paths changed and reconstruct/webhook-signature code is untouched.

## Definition of done

- [ ] A `done`+`null` auto-rig job with a stored `result_glb_url` is recovered by at least one headless-capable driver (cron), proven by test 6a.
- [ ] The MAX_AGE reaper runs on **every** cron tick regardless of candidate count, proven by test 6b; `reaped` always present in the response.
- [ ] Throughput (BATCH and/or schedule) is raised with a commented arithmetic justification; candidates ordered oldest-quiet-first.
- [ ] Recovery reuses a stored `result_glb_url` instead of re-polling the provider (test 4/6a).
- [ ] `finalizeAutoRigStage` is concurrency-safe via a DB-level claim: one winner, losers no-op, a thrown winner releases the claim to a cron-selectable status (test 6c).
- [ ] Reconstruct pipeline, webhook signature verification, SSRF host pinning, and the rig gate are all unchanged.
- [ ] `npm test` green; no console errors/warnings from changed code; no esbuild-contaminated `api/*.js`.
- [ ] `data/changelog.json` has one `fix` entry (plain language: avatars that failed to finish rigging now self-heal); `npm run build:pages` run and passing.
- [ ] `git diff` self-reviewed; staged with explicit paths only.

## Out of scope / follow-ups

- Mesh→rig **gate** tuning (when to auto-rig at all) — `01-...md`.
- Reconstruct-pipeline finalize hardening (`api/_lib/reconstruct-finalize.js`) — defer unless a shared helper extraction is trivially safe.
- Surfacing a per-avatar "rigging…" / "rig failed, retry" state in the avatar UI — note the gap for a follow-up UI prompt; don't build it here.
- Provider-side webhook retry configuration on Replicate — infra, out of band.
