# 05 — Secrets & env hygiene

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** `api/_lib/env.js`, `.env.example`, secret reads across `api/`/`workers/`/`scripts/`, `api/_lib/secret-box.js`.
**Pairs with:** `07` (security), `49` (key rotation).

## Why this matters for $1B
This platform custodies wallets and private keys (`AGENT_RELAYER_KEY`, `THREEWS_SOL_PARENT_SECRET_BASE58`, treasury wallets). A single leaked secret = drained funds = dead company. Investors run secret scanners on day one of diligence.

## Map — real anchors
- `api/_lib/env.js` — lazy getters `req()`/`opt()`/`addr()`/`pem()`; prod fail-closed guards (e.g. `MULTIPLAYER_SHARED_SECRET`, `AGENT_RELAYER_KEY`).
- `api/_lib/secret-box.js` — AES-256-GCM for custodial secrets; `api/_lib/agent-wallet.js` uses it.
- `.env.example` — documents ~150 vars. Must list every var the code reads.
- `api/_lib/http.js` — already redacts lat/lng/token from logs before Sentry/alerts.

## Do this
1. **No committed secrets:** scan the full git working tree + history for leaked keys (private keys, API tokens, base58 secrets, connection strings). `git secrets` / `trufflehog`-style scan. Any real secret in history → rotate it and document in `49`.
2. **Env completeness:** diff every `process.env.X` / `req('X')` / `opt('X')` read in `api/`, `workers/`, `scripts/` against `.env.example`. Add every missing var with a one-line description + example placeholder (never a real value).
3. **Fail-closed in prod:** every secret that, if unset, would silently degrade security (signing keys, shared secrets, encryption keys) must throw in production when missing — extend the `env.js` guard pattern. Optional-with-fallback is only for genuinely optional features.
4. **No secrets to client:** confirm no secret-bearing var is read in `src/` (client bundles). Only `VITE_`-prefixed public values may reach the browser. Grep `src/` for sensitive var names.
5. **No secrets in logs:** audit `console.log`/error and alert payloads for secret leakage; extend the `http.js` redaction list as needed.
6. **Encryption at rest:** confirm all custodial secrets (wallet keys) go through `secret-box.js` (per-record salt), never plaintext in DB.

## Must-not
- Never put a real secret value in `.env.example`, a test fixture, a comment, or a commit message.
- Do not weaken a fail-closed guard to make local dev easier — use a documented dev default that is obviously non-production.

## Definition of done
- [ ] Secret scan over working tree + history is clean (or every hit rotated + documented).
- [ ] `.env.example` lists every var the code reads, with placeholders only.
- [ ] All security-critical secrets fail closed in prod when unset.
- [ ] No secret reaches the client bundle; no secret appears in logs/alerts.
- [ ] `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
