# 08 · Error Handling & Failsafes

## Mission
No error without a solution. Every boundary (network, user input, wallet, RPC, 3D asset load)
degrades gracefully with a clear, actionable recovery path — never a blank void, never a thrown
stack to the user, never a silent failure. (Precedent: USDC checkout now survives a malformed RPC
reply instead of erroring — apply that discipline everywhere.)

## Context
- CLAUDE.md: "Errors handled at boundaries; internal code trusts itself." "No errors without
  solutions." Real fallbacks/failsafes, not lazy propagation.
- Boundaries: `api/` handlers, `workers/`, Solana RPC calls, wallet adapters, GLB/animation loaders
  (`src/glb-canonicalize.js`, `walk-sdk/src/internal/load-avatar.js`), x402 (`api/x402/*`,
  `src/forge-pay.js`).

## Tasks
1. **Map boundaries:** list every network/RPC/wallet/asset-load call site. For each, verify there is
   (a) a typed error path, (b) a user-facing message that says what happened + how to recover, and
   (c) a real fallback where one exists (retry, alternate RPC, default avatar, free engine, etc.).
2. **Global safety nets:** ensure a top-level `unhandledrejection` + `error` handler reports to the
   client-error endpoint (`/api/client-errors`) and the user sees a recoverable state, not a frozen UI.
3. **API handlers:** every `api/*.js` returns structured errors with correct status codes; no
   unhandled throws; no leaking internals/stack traces to clients; inputs validated at the edge.
4. **3D/asset failures:** a failed GLB never shows a T-pose or blank canvas — confirm the
   default-rig / default-avatar fallbacks (CLAUDE.md avatar rule) hold on every viewer surface.
5. **Retry/backoff:** adopt the existing resilience helper (memory note: cockatiel) for flaky
   external calls instead of hand-rolling; add idempotency where a retry could double-charge.
6. **Kill lazy propagation:** replace any `catch (e) { throw e }` / silent `catch {}` that hides a
   real failure with a real handler or a logged, recoverable fallback.

## Acceptance
- Every boundary has designed error + recovery UI; no blank/frozen states under failure injection.
- No unhandled rejections (verify with prompt 03's sweep under forced-offline + forced-RPC-failure).
- API handlers return correct status codes and never leak stack traces.
- Asset-load failures fall back, never T-pose.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real fallbacks and failsafes only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths; re-check before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/08-error-handling-failsafes.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
