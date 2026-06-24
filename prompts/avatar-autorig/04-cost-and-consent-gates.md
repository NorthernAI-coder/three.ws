# Gate auto-rig spend, abuse, humanoid eligibility, and private-avatar privacy

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
Auto-rig fires on **every** non-rigged avatar create. `POST /api/avatars` (upload/import) and `POST /api/avatars/from-forge` (chat "text → 3D avatar" save) both call `maybeAutoRigAvatar()` from a `queueMicrotask` after the 201 returns. That call submits a **paid GPU rerig job** on Replicate / a self-host backend. Today the spend path is wide open: there is no per-user rate limit on the rig submission, no plan/holder gate, no daily account spend ceiling, no humanoid eligibility check, and private avatars are handed a **permanent public R2 URL** to a third-party provider. This is the cost-and-consent gate for the auto-rig program. It sits alongside `01-sibling-materialization.md` (the keystone — auto-rig now materializes a rigged SIBLING avatar with `parent_avatar_id` = the static source, rather than swapping `storage_key` in place; build this on the sibling model, not the in-place swap) and the abuse/SSRF work in `03-ssrf-hardening.md`.

Why it matters: each auto-rig job is real money (UniRig GPU time). An attacker can script avatar creates and burn the platform's GPU budget at zero cost to themselves; a non-humanoid mesh burns a job and produces a garbage skeleton; and a user's **private** avatar mesh is currently shipped to an external provider over a long-lived public URL with no record and no opt-out. The forge MCP tool already solved the humanoid problem with a real classifier and the money-safety posture — we mirror that bar server-side.

## Background findings
Confirm each by reading the file before you change it.

- `api/avatars/index.js:153-160` — `handleCreate` calls `maybeAutoRigAvatar({ userId, avatar, rigInfo: body.source_meta, source })` inside `queueMicrotask`, **after** `json(res, 201, ...)`. The create path itself has **no** `limits.upload` (or any) rate-limit call — uploads are gated only by `enforceQuotas` (size). So the paid rig job is submitted with zero rate limiting.
- `api/avatars/from-forge.js:62-66` — this route **does** call `limits.upload(auth.userId)` (60/h) before the save, but that bucket gates the *save*, not the rig; and at `:163-170` it auto-rigs unconditionally for static meshes. At `:83` and `:143`/`:167` it trusts a **client-supplied `rigged:true`** body flag (`const rigged = body?.rigged === true`) — fed straight into `rigInfoIsRigged` via `is_rigged`. A client can send `rigged:true` on a static mesh to **skip** the rig gate, or `rigged:false` to **force** a paid rig — neither is verified against the actual GLB.
- `api/_lib/auto-rig.js:85-147` — `maybeAutoRigAvatar` gates only on: avatar present, `rigInfoIsRigged(rigInfo)`, provider configured + `supportsMode('rerig')`, and an in-flight idempotency check (`:108-116`). There is **no** rate limit, **no** plan/tier gate, **no** spend ceiling, and **no** humanoid eligibility check before `provider.instance.submit(...)` at `:121`.
- `api/_lib/auto-rig.js:118` — `const sourceUrl = publicUrl(avatar.storage_key)` always hands a **permanent public CDN URL** to the provider via `submit({ sourceUrl, ... })` at `:121-128`, regardless of the avatar's `visibility`. `maybeAutoRigAvatar`'s signature (`{ userId, avatar, rigInfo, source }`) does not even receive `visibility`, though `createAvatar` returns it on the `avatar` row (`api/_lib/avatars.js:106-128`, `returning *` → `decorate(row)`).
- `api/_lib/r2.js:61-65` — `presignGet({ key, expiresIn = 600 })` already exists and returns a short-lived signed GET URL for bucket keys (passes through absolute URLs untouched). This is the privacy-preserving handoff URL.
- `api/_lib/rate-limit.js:380` — `limits.upload = getLimiter('upload', { limit: 60, window: '1 h' })` exists but is **not** marked `critical`. There is **no** `limits.rig` bucket. Money-moving buckets in this file use `critical: true` (fail closed in prod without Redis) and many add a `*Global` circuit breaker (e.g. `mcp3dGenerate`/`mcp3dGenerateGlobal` at `:309-321`, `videoGenerateUser`/`videoGenerateGlobal` at `:698-703`) — mirror that pattern.
- `mcp-server/src/tools/_humanoid.js` — `classifyHumanoidPrompt(prompt)` is a dependency-free, synchronous keyword classifier returning `{ humanoid, confidence, reason, signals }`. `forge_avatar` (`mcp-server/src/tools/forge-avatar.js:313-341`) runs it **before** paid work and only hard-blocks on a confident `humanoid:false`. This is the exact gate to reuse for prompt-derived auto-rig decisions.
- `api/_lib/three-tier.js` — `resolveUserTier(user)`, `holderUsd(wallet)`, `tierForUsd(usd)`, `TIERS` exist for $THREE holder tiering. `getSessionUser` returns `u.plan` (`api/_lib/auth.js:185`). Use these for the plan/tier gate — do not invent a new entitlement system.

## Scope — in / out
**In:**
- A dedicated `limits.rig` per-user rate limit + a `limits.rigGlobal` circuit breaker, enforced **inside** `maybeAutoRigAvatar` before `submit`.
- A daily per-account spend ceiling on auto-rig jobs (count-based, keyed per user, 24h window, critical).
- A humanoid eligibility gate before paying to rig, reusing the `classifyHumanoidPrompt` classifier on the prompt/source signal, with a non-humanoid skip.
- Privacy: private avatars get a short-lived presigned GET URL (not a permanent public URL) handed to the provider; record in `source_meta` that the mesh was sent externally; opt-out env for private avatars.
- Stop trusting the client `rigged` flag in `from-forge` without server-side GLB verification.
- Tests for all of the above.

**Out (do not touch here):**
- The sibling-materialization completion path (`01-sibling-materialization.md`).
- SSRF hardening of provider/import URLs (`03-ssrf-hardening.md`).
- Quality gate / fallback on the rigged result (`07-quality-gate-and-fallback.md`).
- Observability/event emission beyond the minimal `source_meta` breadcrumbs here (`08-observability-and-events.md`).

## Key files & entry points
- `api/_lib/auto-rig.js` — `maybeAutoRigAvatar()` is where every gate lands (before `submit` at `:121`). `rigInfoIsRigged` at `:41` defines "already rigged".
- `api/avatars/index.js` — `handleCreate` at `:45`; the auto-rig `queueMicrotask` at `:153`.
- `api/avatars/from-forge.js` — client `rigged` flag at `:83`; auto-rig `queueMicrotask` at `:163`.
- `api/_lib/rate-limit.js` — add buckets in the `limits` object (~`:380`, near `upload`).
- `api/_lib/r2.js` — `presignGet` at `:61`, `publicUrl` at `:139`.
- `api/_lib/three-tier.js` — `resolveUserTier`, `holderUsd`, `tierForUsd`, `TIERS`.
- `mcp-server/src/tools/_humanoid.js` — `classifyHumanoidPrompt`. **This module lives under `mcp-server/`.** Either import it from `api/` if the path resolves cleanly under Vercel bundling, or (preferred) extract the classifier into a shared module both consume — see Implementation notes.
- `tests/` — add a focused test file (e.g. `tests/auto-rig-gates.test.js`).

## Requirements
Each requirement is numbered with an explicit acceptance criterion.

1. **Add `limits.rig` and `limits.rigGlobal` to `api/_lib/rate-limit.js`.**
   - `rig: (userId) => getLimiter('rig', { limit: 10, window: '1 h', critical: true }).limit(userId)` — per-user hourly ceiling on auto-rig submissions. `critical: true` so a Redis outage in prod fails closed (a paid job is money-moving), matching the posture of `mcp3dGenerate`/`videoGenerateUser`.
   - `rigGlobal: () => getLimiter('rig:global', { limit: Math.max(60, Number(process.env.AUTO_RIG_GLOBAL_HOURLY) || 300), window: '1 h', critical: true }).limit('global')` — the shared-GPU-budget circuit breaker, env-tunable, floored, mirroring `mcp3dGenerateGlobal`.
   - **Acceptance:** both buckets export and are callable; defaults are documented in a comment matching the surrounding style; `limits.rig` and `limits.rigGlobal` resolve `{ success }` objects in a unit test using the in-memory limiter.

2. **Add a daily per-account spend ceiling `limits.rigDaily`.**
   - `rigDaily: (userId) => getLimiter('rig:daily', { limit: Math.max(5, Number(process.env.AUTO_RIG_DAILY_PER_USER) || 20), window: '1 d', critical: true }).limit(userId)`.
   - This is the hard cost cap independent of the hourly burst bucket — a 24h ceiling so a user can't drip-feed 10/h around the clock.
   - **Acceptance:** the bucket exists, is `critical`, env-tunable, floored at 5; documented in a comment.

3. **Enforce all three buckets INSIDE `maybeAutoRigAvatar`, before `submit`.**
   - In `api/_lib/auto-rig.js`, after the `canRig` check and the in-flight idempotency check (so a no-op never consumes budget), and before building `sourceUrl`/calling `submit`, check in order: `limits.rig(userId)`, `limits.rigDaily(userId)`, `limits.rigGlobal()`. On any `!success`, return `{ queued: false, skipped: 'rate_limited' }` (or `'daily_cap'` / `'global_cap'` to distinguish) without submitting and without inserting a job row.
   - The whole function must remain best-effort (never throw into the caller) — wrap the limiter calls so a limiter error degrades to "skip rig", never a thrown create.
   - **Acceptance:** a test that stubs the limiter to deny returns the corresponding `skipped` reason and asserts `provider.instance.submit` was **not** called and **no** `avatar_regen_jobs` row was inserted.

4. **Add a plan/holder tier gate before paying to rig.**
   - Auto-rig is a paid perk. Decide eligibility from the owner's plan / $THREE holder tier using `api/_lib/three-tier.js` (`resolveUserTier`) and the user's `plan`. Implement a single `isAutoRigEligible({ userId, plan })`-style helper (place it in `auto-rig.js` or a small `api/_lib/auto-rig-eligibility.js`) that returns a boolean. Make the policy explicit and env-overridable via `AUTO_RIG_REQUIRE_TIER` (default: allow all authenticated owners through, but the gate **exists and is wired** so tightening is a config change, not a code change). Free uploads from a brand-new account that exhibit abuse patterns are already bounded by req 3; this gate is the deliberate plan lever.
   - `maybeAutoRigAvatar` must call it before submit; on ineligible, return `{ queued: false, skipped: 'plan_gate' }`.
   - **Acceptance:** with `AUTO_RIG_REQUIRE_TIER` set to a tier the test user lacks, `maybeAutoRigAvatar` returns `skipped: 'plan_gate'` and does not submit; with the default policy, an authenticated owner passes.

5. **Add a humanoid eligibility gate before paying to rig.**
   - Reuse `classifyHumanoidPrompt`. The reliable text signal available at auto-rig time is the generation prompt: `from-forge` has `source_meta.source_prompt` (`api/avatars/from-forge.js:139-146`); uploads may carry `source_meta.source_prompt`/`source_meta.prompt`. Pass the best available prompt string into `maybeAutoRigAvatar` (extend its signature, e.g. `{ ..., prompt }`, and have both callers supply it from `body.source_meta?.source_prompt` / equivalent).
   - Run the classifier; **only hard-skip on a confident `humanoid:false`** (mirror `forge_avatar`'s posture — ambiguity proceeds, since the user explicitly created an avatar). On skip, return `{ queued: false, skipped: 'not_humanoid' }` and record the reason on the avatar's `source_meta` (e.g. `auto_rig_skipped: 'not_humanoid'`, `auto_rig_skip_reason: verdict.reason`) so the UI/owner can see why it didn't rig.
   - When **no** prompt is available (a raw GLB upload), do not block on text — proceed (req 3's spend caps remain the backstop). Leave a `source_meta.auto_rig_humanoid_check: 'no_prompt'` breadcrumb.
   - **Acceptance:** `maybeAutoRigAvatar({ ..., prompt: 'an oak dining table' })` returns `skipped: 'not_humanoid'`, does not submit, and stamps the skip reason in `source_meta`; `prompt: 'a cartoon astronaut'` proceeds; no prompt proceeds.

6. **Share the humanoid classifier without duplicating the term lists.**
   - Do not copy/paste the keyword arrays. Either (a) import `classifyHumanoidPrompt` from `mcp-server/src/tools/_humanoid.js` if it bundles cleanly into the Vercel function, or (b) move the classifier into a shared location (e.g. `src/shared/humanoid-classify.js` or `api/_lib/humanoid-classify.js`) and re-export from `mcp-server/src/tools/_humanoid.js` so both the MCP tool and the API use one source of truth. Update `tests/` references accordingly.
   - **Acceptance:** there is exactly one definition of the humanoid term lists in the repo (`grep -rn "NON_HUMANOID_TERMS"` shows a single declaration); `forge_avatar` and auto-rig both import it; existing `forge_avatar` behavior is unchanged.

7. **Privacy: never hand a permanent public URL for a private avatar to the provider.**
   - `maybeAutoRigAvatar` must receive `visibility` (extend signature; both callers pass `avatar.visibility`).
   - For `visibility === 'private'`: by default do **not** auto-rig at all (private means the owner did not consent to external processing) — return `{ queued: false, skipped: 'private_opt_out' }`. Provide `AUTO_RIG_PRIVATE` env: when set to `'presigned'`, auto-rig is allowed for private avatars but the `sourceUrl` handed to `submit` is a `presignGet({ key: avatar.storage_key, expiresIn: 3600 })` short-lived URL (1h, long enough for the GPU job to fetch) instead of `publicUrl(...)`. When unset/`'off'`, private avatars are skipped.
   - For `public`/`unlisted` avatars, keep using `publicUrl(...)` (they are already externally reachable).
   - Whenever a mesh is sent externally for rigging, stamp `source_meta.rig_mesh_sent_external = true` and `source_meta.rig_mesh_url_kind = 'public' | 'presigned'` on the avatar row at submit time (update `avatars.source_meta` with a merge, not a clobber), so there is a durable record that the mesh left the platform.
   - **Acceptance:** a private avatar with `AUTO_RIG_PRIVATE` unset returns `skipped: 'private_opt_out'` and does not submit; with `AUTO_RIG_PRIVATE=presigned`, `submit` is called with a `sourceUrl` produced by `presignGet` (assert it is the presigned value, not `publicUrl`), and `source_meta.rig_mesh_url_kind === 'presigned'`; a public avatar uses `publicUrl` and stamps `'public'`.

8. **Stop trusting the client `rigged` flag in `from-forge` to skip the gate.**
   - In `api/avatars/from-forge.js`, the rig decision must come from the **server-side `inspectGlb(buf)`** result (already computed at `:117` as `info`), not the client `rigged` body flag. Use `info.isRigged` / `info.skeletonJointCount` for `rigInfo`. Keep `rigged` only as a provenance annotation in `source_meta` (clearly labeled, e.g. `client_claimed_rigged`), never as the gate input.
   - Concretely: change the `maybeAutoRigAvatar` `rigInfo` at `:167` to `{ is_rigged: info.isRigged === true, skeleton_joint_count: info.skeletonJointCount ?? null }` (drop `rigged ||`), and change `source_meta.is_rigged` at `:143` to derive from `info` (server truth), recording the client claim separately.
   - **Acceptance:** a `from-forge` request with `rigged:true` on a body whose fetched GLB has **no** skeleton still auto-rigs (server inspection wins); a request with `rigged:false` on a GLB that **is** skinned is treated as already-rigged and skipped. Add a test driving both via `inspectGlb` on real fixture GLBs (`tests/fixtures/` — reuse an existing rigged + static fixture; if none, generate them deterministically with the project's GLB helpers, no external download).

9. **Wire the new signature through both callers.**
   - `api/avatars/index.js:153-160` and `api/avatars/from-forge.js:163-170` must pass `visibility: avatar.visibility` and `prompt: <best source prompt>` to `maybeAutoRigAvatar`. Both remain fire-and-forget; the 201 still returns immediately.
   - **Acceptance:** `grep` shows both call sites pass `visibility` and `prompt`; create flows still return 201 before the rig work runs (no added `await` on the rig path in the request handler).

10. **Changelog.** Add a `data/changelog.json` entry (tag `security` + `improvement`): holder-readable, e.g. title "Auto-rig now respects privacy, plan limits, and humanoid eligibility" with a plain-language summary (private avatars aren't sent to third parties without opt-in; rigging is rate-limited and skips non-humanoid meshes). Run `npm run build:pages`.
    - **Acceptance:** `npm run build:pages` passes (it validates the entry) and regenerates `CHANGELOG.md`, `public/changelog.json`, `public/changelog.xml`.

## Implementation notes
- **Order of gates inside `maybeAutoRigAvatar`** (cheapest/most-decisive first, so no budget is wasted): (1) avatar present, (2) `rigInfoIsRigged` already-rigged short-circuit, (3) provider `canRig`, (4) in-flight idempotency, (5) `visibility` privacy decision (private → skip or presign), (6) plan/tier eligibility, (7) humanoid classification (when a prompt exists), (8) rate limits `rig` → `rigDaily` → `rigGlobal`, (9) build `sourceUrl` (public vs presigned), (10) `submit`, (11) insert job row + stamp `source_meta`. Steps 1–4 are already present — insert 5–8 between them and the existing `sourceUrl` line at `:118`.
- **Best-effort contract is sacred.** `maybeAutoRigAvatar` must never throw into `handleCreate`. Wrap each new gate in the existing top-level `try/catch` (which already returns `{ queued:false, skipped:'error' }`), and make limiter/presign calls individually defensive so a transient infra failure degrades to "skip rig", never a failed create.
- **`source_meta` merge, not clobber.** When stamping `rig_mesh_sent_external`, `rig_mesh_url_kind`, `auto_rig_skipped`, etc., read the current row's `source_meta` and merge (the finalize stage at `auto-rig.js:201` already does `{ ...(av.source_meta || {}), ... }` — follow that idiom). Use a single `update avatars set source_meta = ... where id = ... and owner_id = ...` keyed by both columns, as the rest of the file does.
- **Presigned URL lifetime.** Use `expiresIn: 3600`. The job submits immediately and the provider fetches within seconds-to-minutes, but a queued backend may fetch later; 1h is the safe upper bound. Do not exceed it — the point is a short-lived URL.
- **Classifier reuse:** prefer extracting to `api/_lib/humanoid-classify.js` and re-exporting from the MCP module — it keeps the API self-contained under Vercel bundling and avoids reaching across the `mcp-server/` boundary at runtime. Mirror the existing `src/shared/rig-classify.js` ↔ `auto-rig.js:38-46` split pattern (shared logic, snake_case server shape).
- **Tier gate default must not regress current behavior** for legit users: default policy allows authenticated owners. The value is that the lever now exists and the abuse caps (req 1–3) are the real teeth.
- **Do not add a rate limit to the create request itself** here — that is a broader change; the rig submission is the money path and is where the limit belongs. (If you also want to gate the create, note it as a follow-up, don't scope-creep.)

## Verification
- `npm test` — full suite green, including the new `tests/auto-rig-gates.test.js`.
- New test must cover, with the in-memory limiter and a stubbed provider (`supportsMode('rerig') === true`, spy on `submit`):
  - rate-limit deny → `skipped: 'rate_limited'`/`'daily_cap'`/`'global_cap'`, no submit, no job row;
  - plan gate (`AUTO_RIG_REQUIRE_TIER`) deny → `skipped: 'plan_gate'`, no submit;
  - non-humanoid prompt → `skipped: 'not_humanoid'`, no submit, skip reason in `source_meta`;
  - humanoid prompt + public avatar → submit called with `publicUrl`, `source_meta.rig_mesh_url_kind === 'public'`;
  - private avatar, `AUTO_RIG_PRIVATE` unset → `skipped: 'private_opt_out'`;
  - private avatar, `AUTO_RIG_PRIVATE=presigned` → submit called with presigned URL, `rig_mesh_url_kind === 'presigned'`;
  - `from-forge` rig decision derives from `inspectGlb`, not the client `rigged` flag (two fixtures).
- `grep -rn "NON_HUMANOID_TERMS"` → exactly one declaration.
- Manual: with a local `.env` lacking Redis (in-memory limiter), create an avatar via `POST /api/avatars` and confirm the 201 returns immediately and the rig path logs a gate decision (not an unbounded submit). Confirm `head -1` of any changed `api/*.js` is **not** `__defProp`/`createRequire` before staging.
- `npm run build:pages` passes and updates the changelog artifacts.

## Definition of done
- [ ] `limits.rig`, `limits.rigDaily`, `limits.rigGlobal` added, `critical`, env-tunable, documented.
- [ ] All three limits + plan gate + humanoid gate + privacy decision enforced inside `maybeAutoRigAvatar` before `submit`, in the order above; function still never throws into the caller.
- [ ] Private avatars are not sent externally unless `AUTO_RIG_PRIVATE=presigned`, and then only via a 1h presigned GET; `source_meta` records `rig_mesh_sent_external` + `rig_mesh_url_kind`.
- [ ] `from-forge` rig gate uses server-side `inspectGlb`, not the client `rigged` flag; client claim kept only as labeled provenance.
- [ ] Humanoid classifier has a single definition; both `forge_avatar` and auto-rig import it; `forge_avatar` behavior unchanged.
- [ ] Both call sites pass `visibility` and `prompt`; 201 still returns before rig work.
- [ ] New `tests/auto-rig-gates.test.js` covers every case above; `npm test` green.
- [ ] Changelog entry added; `npm run build:pages` green.
- [ ] No other coin referenced anywhere in the diff; staged explicit paths only; `git diff --staged` self-reviewed; no esbuild-bundled `api/*.js`.

## Out of scope / follow-ups
- Sibling-avatar materialization + completion swap → `01-sibling-materialization.md` (build on top of it; this prompt's `source_meta` stamps must survive into the sibling).
- Completion state machine for rig jobs → `02-completion-statemachine.md`.
- SSRF hardening of the provider/import fetch path → `03-ssrf-hardening.md`.
- Coverage of additional create entry points (studio, reconstruct) → `05-coverage-gaps.md`.
- Rig result caching / backfill of already-created static avatars → `06-rig-cache-and-backfill.md`.
- Post-rig quality gate + fallback to static on a bad skeleton → `07-quality-gate-and-fallback.md`.
- Emitting rig lifecycle events/metrics beyond the `source_meta` breadcrumbs here → `08-observability-and-events.md`.
- Consolidated test suite hardening → `09-test-suite.md`.
- Rate-limiting the avatar *create* request itself (not just the rig submission) — deferred, broader auth-surface change.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/avatar-autorig/04-cost-and-consent-gates.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
