# Centralize SSRF host-pinning for all provider-result GLB fetches

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
The auto-rig pipeline submits a `rerig` job to a remote provider (Replicate today), then fetches the provider-returned GLB URL server-side, canonicalizes it, and stores it. **Fetching an attacker-influenceable URL server-side is a classic SSRF sink:** if a forged/compromised provider payload points the fetch at `http://169.254.169.254/...` (cloud metadata), `http://127.0.0.1:.../` (loopback), or an RFC1918 address, the server will dutifully connect.

The Replicate **webhook** path already defends this with a host allowlist (`isAllowedResultUrl`) that pins the URL to Replicate's delivery hosts before handing it to the finalize stage. But the **other three completion paths fetch the same kind of URL with a bare `fetch()` and no guard at all**: the browser regenerate-status poll, the cron sweep, and the reconstruct rig poller. This is an inconsistent, partial defense — exactly the kind of half-wired security boundary the operating rules forbid. The repo also already ships a battle-tested SSRF guard (`api/_lib/ssrf-guard.js`) with DNS-resolution, per-redirect-hop re-validation, and IP-pinned connect — but the auto-rig fetch paths don't use it.

This is part 3 of the 9-part auto-rig hardening program in `prompts/avatar-autorig/`. It is independent of the sibling-materialization keystone (`01-sibling-materialization.md`) — apply the guard to whatever finalize signature exists when you run. Coordinate with `02-completion-statemachine.md` (same paths) only to avoid stepping on its edits.

## Background findings
Confirm each of these by reading the code before you change anything.

1. **The GOOD path — webhook host-pin.** `api/webhooks/replicate.js`:
   - `REPLICATE_RESULT_HOSTS` (~line 63-67): `['replicate.delivery','replicate.com','pbxt.replicate.delivery']`.
   - `isAllowedResultUrl(raw)` (~line 69-79): parses the URL, requires `https:`, lowercases the host, allows exact match or `.`-suffix match against the host list.
   - `extractGlbUrl(output)` (~line 81-98): pulls a URL out of provider output. **Weakness:** for a plain string it returns `output` verbatim (line 83) with no `http(s)` check; the object branch (line 92-96) returns any stringy value at keys `glb|mesh|mesh_url|output_url|url|model` with no scheme check. The host-pin downstream currently saves it on the webhook path only.
   - Both finalize calls are gated by `isAllowedResultUrl(nextGlbUrl)` (line 207 and line 232) before `finalizeReconstructStage` / `finalizeAutoRigStage`. Good — but this gate lives in this one file.

2. **NO-pin path #1 — browser poll.** `api/avatars/_actions.js`:
   - Poll at line 459-493 reads `update.resultGlbUrl` from `provider.instance.status(...)` and writes it to `avatar_regen_jobs.result_glb_url` with **no host validation**.
   - It then calls `finalizeReconstructStage(... glbUrl: job.result_glb_url)` (line 519), `finalizeAutoRigStage(... glbUrl: job.result_glb_url)` (line 538), and `pollRiggingStage(...)` (line 500) — none guarded.

3. **NO-pin path #2 — cron sweep.** `api/cron/auto-rig-sweep.js` line 117-125: `update = await provider.instance.status(job.ext_job_id)`; on `done` it calls `finalizeAutoRigStage({ ... glbUrl: update.resultGlbUrl })` with **no host validation**.

4. **NO-pin path #3 — rig poller.** `api/_lib/reconstruct-finalize.js`:
   - `fetchGlbBuffer(url)` (line 27-35) is a bare `await fetch(url)` — no SSRF guard.
   - `pollRiggingStage` fetches `update.resultGlbUrl` (line 251) and `rig.unriggedUrl` (line 238, 262) through it.
   - `finalizeReconstructStage` fetches `glbUrl` (line 142) through it.
   - `api/_lib/auto-rig.js` has its OWN duplicate `fetchGlbBuffer` (line 48-56), also a bare `fetch`, used by `finalizeAutoRigStage` (line 185).

5. **The reusable guard already exists.** `api/_lib/ssrf-guard.js` exports:
   - `assertSafePublicUrl(input, { allowHttp })` (line 101) — parse + protocol-check + DNS-resolve + per-address private/metadata/loopback rejection; throws `SsrfBlockedError`.
   - `fetchSafePublicUrl(input, init, opts)` (line 134) — assert + fetch, follows redirects MANUALLY re-validating each hop.
   - `fetchSafePublicUrlPinned(input, init, opts)` (line 159) — IP-pinned connect, closes the DNS-rebinding window; intended "for any fetch whose response is forwarded to another service or executed." Already used by `api/pump-fun-mcp.js`, `api/widgets/[id]/[action].js`, `api/_lib/onchain.js`, etc.
   - `SsrfBlockedError` (line 65) — `code: 'ssrf_blocked'`, `status: 400`.
   - Blocks: AWS/Azure/GCP/Alibaba IMDS IPs, all RFC1918, loopback, link-local, ULA, CGNAT, multicast, `::ffff:` mapped (line 22-63).

6. **Test framework.** `npm test` = `vitest run && playwright test` (`package.json` line 145). Vitest config at `vitest.config.js`. Existing related test: `tests/auto-rig-gate.test.js`.

## Scope — in / out
**In scope**
- A single shared "provider-result URL" guard module: parse + scheme + **provider-host allowlist** + the full `ssrf-guard.js` IP/DNS checks.
- Replace the per-path host-pin and bare `fetch()` calls on ALL FOUR paths (webhook, browser poll, cron sweep, reconstruct rig poller incl. `auto-rig.js`) with the shared guard.
- Tighten `extractGlbUrl` so non-`http(s)` / non-string output is never returned as a fetch target.
- Vitest tests proving private/loopback/metadata hosts are rejected on the poll AND cron paths, not just the webhook.

**Out of scope**
- Changing provider submission, the rig/materialize decision, or completion state transitions (that's `02-completion-statemachine.md`).
- Cost/consent gates (`04-`), cache/backfill (`06-`), quality gate (`07-`), observability events (`08-`).
- Re-architecting `ssrf-guard.js` itself — reuse it as-is.

## Key files & entry points
- `api/_lib/ssrf-guard.js` — reuse `fetchSafePublicUrlPinned` / `assertSafePublicUrl` / `SsrfBlockedError`. Do not reimplement IP checks.
- `api/_lib/provider-result-url.js` — **NEW** shared module you will create (name it precisely; see Requirements).
- `api/webhooks/replicate.js` — move `REPLICATE_RESULT_HOSTS` + `isAllowedResultUrl` + harden `extractGlbUrl` into the shared module; import from there.
- `api/avatars/_actions.js` — poll (line 459-493) + finalize calls (line 500/519/538).
- `api/cron/auto-rig-sweep.js` — line 117-125.
- `api/_lib/reconstruct-finalize.js` — `fetchGlbBuffer` (line 27-35), used by `finalizeReconstructStage` + `pollRiggingStage`.
- `api/_lib/auto-rig.js` — duplicate `fetchGlbBuffer` (line 48-56), used by `finalizeAutoRigStage`.
- `tests/` — add a vitest spec; mirror `tests/auto-rig-gate.test.js` style.

## Requirements
Each requirement has an acceptance criterion (AC). All must hold.

1. **Create `api/_lib/provider-result-url.js`** exporting:
   - `PROVIDER_RESULT_HOSTS` — the allowlist, seeded from the webhook's `REPLICATE_RESULT_HOSTS` (`replicate.delivery`, `replicate.com`, `pbxt.replicate.delivery`). Comment that these are the hosts a provider serves rigged/reconstructed GLBs from.
   - `isAllowedProviderResultUrl(raw)` — exactly the webhook semantics: parse; require `https:`; lowercase host; exact-or-`.`-suffix match against `PROVIDER_RESULT_HOSTS`; return boolean (never throw).
   - `extractGlbUrl(output)` — hardened version (see Req 3).
   - `assertProviderResultUrl(raw)` — throws `SsrfBlockedError('result url not on an allowed provider host')` when `isAllowedProviderResultUrl(raw)` is false; otherwise returns the raw string. Reuse the existing `SsrfBlockedError` class.
   - `fetchProviderGlbBuffer(url, { maxBytes })` — the single canonical fetch-and-buffer helper (see Req 4).
   - **AC:** `node -e "import('./api/_lib/provider-result-url.js').then(m=>console.log(Object.keys(m)))"` lists all five exports; importing has no side effects.

2. **Webhook reuses the shared module — no behavior change there.** In `api/webhooks/replicate.js`, delete the local `REPLICATE_RESULT_HOSTS`, `isAllowedResultUrl`, and `extractGlbUrl`; import `isAllowedProviderResultUrl` (aliased to `isAllowedResultUrl` at call sites or rename the calls) and `extractGlbUrl` from `provider-result-url.js`. The two finalize gates (line 207, 232) keep gating on the allowlist check.
   - **AC:** `grep -n "REPLICATE_RESULT_HOSTS\|function isAllowedResultUrl\|function extractGlbUrl" api/webhooks/replicate.js` returns nothing; the file imports them from `../_lib/provider-result-url.js`; webhook still rejects a non-allowlisted output URL (does not call finalize).

3. **Harden `extractGlbUrl`.** A returned value MUST be a `string` that begins with `https://` (or `http://` only if you also keep an `allowHttp` story consistent with the guard — default reject `http:`). For the string branch, validate scheme before returning. For the array branch, keep the "prefer `.glb`" preference but only return entries matching `^https?:\/\//`. For the object branch, validate each candidate's scheme. Non-string, empty, or non-http(s) input returns `null`.
   - **AC:** unit assertions: `extractGlbUrl('file:///etc/passwd')`, `extractGlbUrl('javascript:alert(1)')`, `extractGlbUrl({ url: 'gopher://x' })`, `extractGlbUrl(42)`, `extractGlbUrl({ url: 169 })` all return `null`; `extractGlbUrl('https://pbxt.replicate.delivery/x.glb')` returns the string; `extractGlbUrl(['https://a/x.glb','https://b/y.png'])` returns the `.glb` entry.

4. **`fetchProviderGlbBuffer` is the only place provider GLB bytes are fetched.** It must:
   - Call `assertProviderResultUrl(url)` first (host allowlist gate).
   - Fetch via `fetchSafePublicUrlPinned(url, { signal }, { allowHttp: false })` from `ssrf-guard.js` (pinned connect + per-hop re-validation — the response is stored/forwarded, so use the pinned variant, matching `ssrf-guard.js`'s own guidance at line 152-158).
   - Enforce the existing `MAX_GLB_BYTES` ceiling (64 MB) on both the `content-length` header and the actual buffer length, preserving the current error messages (`fetch glb: <status>`, `glb too large: <n> bytes`).
   - Apply a request timeout (use `AbortSignal.timeout(...)`, e.g. 30s) so a hung provider host can't wedge a serverless invocation.
   - **AC:** calling it with `http://169.254.169.254/x.glb`, `https://localhost/x.glb`-style private targets, or any non-allowlisted host throws `SsrfBlockedError` (`code === 'ssrf_blocked'`) BEFORE any socket to a private range; a 64 MB+ `content-length` throws the size error.

5. **Replace both duplicate `fetchGlbBuffer` definitions with the shared helper.** In `api/_lib/reconstruct-finalize.js` (line 27-35) and `api/_lib/auto-rig.js` (line 48-56), delete the local `fetchGlbBuffer` and import `fetchProviderGlbBuffer` (use it directly or re-export a `fetchGlbBuffer` alias). Every call site — `finalizeReconstructStage` (line 142), `pollRiggingStage` (line 238, 251, 262), `finalizeAutoRigStage` (line 185) — now routes through the guarded fetch.
   - **AC:** `grep -rn "await fetch(" api/_lib/reconstruct-finalize.js api/_lib/auto-rig.js` returns nothing; both files import from `provider-result-url.js`; `MAX_GLB_BYTES` is defined once (in the shared module) and not duplicated.

6. **Browser poll path gates before persisting/fetching.** In `api/avatars/_actions.js` poll block (line 459-493), when `update.resultGlbUrl` is present, validate it with `isAllowedProviderResultUrl` before writing it to `result_glb_url`. If it fails, do NOT persist the URL — set `nextStatus = 'failed'` and `nextError = 'provider returned a disallowed result url'` so the job terminates cleanly and the client sees an actionable error instead of a silent SSRF attempt. (Defense-in-depth: the shared fetch helper would reject it anyway, but failing early keeps a poisoned URL out of the DB.)
   - **AC:** a stubbed provider `status()` returning `resultGlbUrl: 'http://127.0.0.1/x.glb'` results in the job row going `failed` with that error string and `result_glb_url` left null; no finalize stage is invoked.

7. **Cron sweep gates before finalize.** In `api/cron/auto-rig-sweep.js` (line 117-125), before calling `finalizeAutoRigStage`, validate `update.resultGlbUrl` with `isAllowedProviderResultUrl`. On failure call `failJob(...)` with `'provider returned a disallowed result url'` and increment `summary.failed` instead of finalizing.
   - **AC:** a stubbed `status()` returning a private/metadata `resultGlbUrl` fails the job (does not call `finalizeAutoRigStage`); a valid `pbxt.replicate.delivery` URL still finalizes.

8. **No path can reach `putObject` with attacker-controlled bytes from a disallowed host.** Audit: every server-side fetch of a provider-returned URL in the auto-rig/reconstruct flow goes through `fetchProviderGlbBuffer`. `rig.unriggedUrl` is one we generated via `publicUrl(...)` (R2 host) — it must ALSO pass the guard (your own R2/CDN public host must therefore be in `PROVIDER_RESULT_HOSTS`, or `unriggedUrl` fetches must use a separate already-trusted helper). Decide explicitly and comment which hosts are allowed and why. Do not leave `rig.unriggedUrl` fetching through a bare `fetch`.
   - **AC:** `grep -rn "fetch(" api/_lib/reconstruct-finalize.js api/_lib/auto-rig.js api/cron/auto-rig-sweep.js` shows only guarded helpers (or `fetchSafePublicUrl*`); the R2 public host is covered so legitimate `unriggedUrl` fetches succeed in `npm test`.

9. **Errors handled at the boundary.** A `SsrfBlockedError` thrown mid-finalize must not crash the webhook ack, the cron sweep loop, or the poll response — each already has a try/catch; ensure the blocked case is caught there and logged with the job id (`console.warn('[<path>] blocked result url', { jobId, host })`), never swallowed silently into a 500.
   - **AC:** triggering a blocked URL on each path produces a warn log and a clean response (webhook 200 ack, cron continues the batch, poll returns `failed`), no unhandled rejection.

10. **Tests (vitest).** Add `tests/provider-result-url.test.js` covering: `extractGlbUrl` hardening (Req 3 ACs); `isAllowedProviderResultUrl` allow/deny matrix incl. `.`-suffix match and `http:` rejection; `assertProviderResultUrl` throws `SsrfBlockedError` on a disallowed host. Add `tests/auto-rig-ssrf.test.js` (or extend an existing spec) that stubs `getRegenProvider`/`provider.instance.status` to return a loopback/metadata `resultGlbUrl` and asserts: (a) the browser-poll handler fails the job without persisting the URL; (b) the cron sweep fails the job without calling `finalizeAutoRigStage`. Stub the provider — never hit a real network host in tests.
   - **AC:** `npx vitest run tests/provider-result-url.test.js tests/auto-rig-ssrf.test.js` passes; the SSRF cases would FAIL against the pre-change code (verify by reasoning/temporarily reverting the guard).

## Implementation notes
- **Reuse, don't reinvent.** All IP/DNS/redirect logic lives in `ssrf-guard.js`. The new module adds only the provider-host allowlist + GLB extraction/size-ceiling on top. The pinned fetch (`fetchSafePublicUrlPinned`) already re-validates every redirect hop (line 204-208) — that satisfies "re-validate every redirect hop."
- **Layering.** Host allowlist (`isAllowedProviderResultUrl`) is the narrow positive gate; `ssrf-guard.js` is the broad negative gate. Apply BOTH: a provider could be compromised to redirect a `replicate.delivery` URL toward a private IP, so the IP check still matters after the host check passes.
- **`extractGlbUrl` string branch** is the riskiest line (`replicate.js` line 83 returns `output` raw). A provider field like `output: "file:///etc/passwd"` currently passes straight through. Validate scheme there.
- **Match existing error surfaces.** Keep `fetch glb: <status>` and `glb too large` messages so existing error-path tests/logs don't churn.
- **`SsrfBlockedError` import** comes from `ssrf-guard.js`; do not define a second error class.
- **Don't double-define `MAX_GLB_BYTES`** — export it from the shared module and import in both `reconstruct-finalize.js` and `auto-rig.js`.
- **Coordinate with `01-` / `02-`.** If sibling-materialization changed `finalizeAutoRigStage`'s signature, apply the guarded fetch to whatever fetch call exists. The guard is orthogonal to the materialization shape.
- **Watch the `npx vercel build` trap** — if you ever run it, check `head -1 api/...` for `__defProp` and `git restore` before committing.

## Verification
Run and read the output of each:
- `npx vitest run tests/provider-result-url.test.js tests/auto-rig-ssrf.test.js` — new specs pass.
- `npm test` — full suite still green (vitest + playwright).
- `grep -rn "await fetch(" api/_lib/reconstruct-finalize.js api/_lib/auto-rig.js` — empty (all routed through the guard).
- `grep -n "REPLICATE_RESULT_HOSTS\|function isAllowedResultUrl\|function extractGlbUrl" api/webhooks/replicate.js` — empty (moved to shared module).
- `grep -rn "provider-result-url" api/` — imported by `replicate.js`, `_actions.js`, `auto-rig-sweep.js`, `reconstruct-finalize.js`, `auto-rig.js`.
- Manual reasoning check: trace each of the four paths (webhook, poll, cron, rig poller) and confirm there is no `fetch(<provider url>)` that bypasses `assertProviderResultUrl` + a `ssrf-guard.js` fetch.
- `head -1 api/_lib/provider-result-url.js api/webhooks/replicate.js` — confirm not esbuild-bundled (no `__defProp`/`createRequire`).
- `git diff --staged` self-review before committing; stage explicit paths only.

## Definition of done
- [ ] `api/_lib/provider-result-url.js` exists with the five exports; reuses `ssrf-guard.js` (no reimplemented IP logic).
- [ ] All four provider-result fetch paths (webhook, browser poll, cron sweep, reconstruct rig poller incl. `auto-rig.js`) go through `assertProviderResultUrl` + `fetchProviderGlbBuffer`.
- [ ] `extractGlbUrl` rejects non-http(s) / non-string output.
- [ ] Browser poll and cron sweep fail the job cleanly on a disallowed URL without persisting/finalizing it.
- [ ] No bare `await fetch(<provider url>)` remains in the auto-rig/reconstruct flow.
- [ ] New vitest specs pass and would fail against pre-change code; `npm test` green.
- [ ] No console errors/warnings from your code beyond the intended `[..] blocked result url` warns.
- [ ] Changelog entry added (tag `security`, holder-readable: "Hardened avatar auto-rig against malicious provider URLs across all completion paths") and `npm run build:pages` run.
- [ ] `git diff --staged` reviewed; explicit paths staged; not esbuild-contaminated.

## Out of scope / follow-ups
- Completion state-machine consistency across these same paths → `02-completion-statemachine.md`.
- Sibling-avatar materialization semantics → `01-sibling-materialization.md` (KEYSTONE).
- Cost/consent gates before submitting rig jobs → `04-cost-and-consent-gates.md`.
- Coverage gaps for other creation paths → `05-coverage-gaps.md`.
- Rig cache/backfill → `06-rig-cache-and-backfill.md`; quality gate/fallback → `07-quality-gate-and-fallback.md`; observability/events → `08-observability-and-events.md`; full test suite → `09-test-suite.md`.
