# 01 · Expand the deploy release gate + harden CI

> **Phase 0 — Test confidence** · **Depends on:** none · **Parallel-safe:** no (foundation) · **Effort:** M

## Mission
Today the pre-deploy gate (`scripts/test-gate.mjs`) runs **7 files / ~73 assertions**, while
`.vercelignore` strips all but those 7 files from the deploy. A regression in any of the ~90
untested-on-deploy endpoints — including most of the money path — can ship silently. Turn the
gate into a real safety net and make CI enforce it. Nothing else in this program is trustworthy
until a green gate actually means "safe to deploy."

## Context (read first)
- `CLAUDE.md` + `STRUCTURE.md`.
- `scripts/test-gate.mjs` — the curated critical-path gate (`GATE_TESTS` list).
- `.vercelignore` — re-includes only the gate files into the deploy bundle. **Keep it in lockstep with the gate.**
- `.github/workflows/*.yml` — current CI (lint + full vitest + guards; typecheck is advisory only).
- `package.json` scripts: `test`, `test:core`, `test:gate`, `test:e2e`, `typecheck`, `lint`.

## Current state (from audit)
- Gate covers: `solana-confirm`, `http-cache-control`, `agent-custody-guards`, `agent-wallet-vanity`, `api/x402` (manifest/verify), `three-token-leaderboard`, `healthz`.
- **Not in the gate:** `x402-pay`, `x402-checkout`, `x402-merchant`, `x402-status`, agent A2A payment routes, all forge endpoints, wallet deposit/withdraw/pay, avatar create/render, `solana-rpc`.
- Typecheck (`tsc -p jsconfig.json`) runs advisory-only; ESLint warns but doesn't block. No flake detection.
- Drift risk: a gate test file can be deleted without `.vercelignore` noticing → deploy silently loses coverage.

## Build this
1. **Grow `GATE_TESTS`** to a production tier (~30–40 files) covering money path, core features, auth/access, and reliability. Coordinate with prompts 02–04 — they create the tests this gate will reference. Add only tests that are deterministic and offline-safe (no live DB/RPC/Redis).
2. **Lockstep `.vercelignore`**: write a single source of truth (e.g. the `GATE_TESTS` array) and have `.vercelignore` generated/validated from it. Add `scripts/test-gate.mjs --audit` that fails if a gate-listed file is missing OR a gate file isn't re-included in `.vercelignore`.
3. **Harden CI** (`.github/workflows`): on PR run `lint` (blocking), `typecheck` (blocking — flip from advisory), `vitest run`, and `test:gate`. On the deploy path, run `test:gate` as a required check. Cache npm + node_modules for speed.
4. **Flake detection**: add an opt-in CI job that re-runs the gate N times (e.g. 3×) nightly and reports any non-deterministic failures.
5. **Coverage visibility**: emit a one-line summary (files, assertions, duration) and a coverage delta comment is *not* required, but `npm run test:gate` must print exactly what it guards.

## Files likely in play
`scripts/test-gate.mjs`, `.vercelignore`, `.github/workflows/ci.yml` (+ a new nightly workflow), `package.json` (scripts), `jsconfig.json` / `tsconfig` if typecheck needs fixes to go blocking.

## Out of scope
Writing the endpoint tests themselves (that's prompts 02–04). Here you build the *gate machinery* and wire whichever tests already exist; leave TODO-free placeholders out — only reference tests that exist.

## Definition of done
- [ ] `npm run test:gate` runs the expanded set, green, and prints what it covers.
- [ ] `npm run test:gate -- --audit` fails loudly on gate/`.vercelignore` drift; passes now.
- [ ] CI blocks merge on lint + typecheck + vitest + gate; config committed.
- [ ] Typecheck is clean and blocking (fix real type errors; don't suppress).
- [ ] Nightly flake job committed.
- [ ] Changelog: infra-only → **no** changelog entry (internal).
- [ ] `git diff` reviewed; explicit paths staged.

## Guardrails
Follow CLAUDE.md. Don't weaken the gate to make it pass — fix the underlying test/type issues. Push both remotes when done.
