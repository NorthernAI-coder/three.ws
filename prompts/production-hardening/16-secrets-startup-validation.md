# 16 · Startup secret validation + key-rotation safety

> **Phase 3 — Security** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
`.env.example` documents 90–100+ secrets, but nothing validates them at boot. Worst case from the
audit: when `WALLET_ENCRYPTION_KEY` is unset it **falls back to `JWT_SECRET`** — so a `JWT_SECRET`
compromise = all custodial wallets compromised. And a missing `UPSTASH_*`/`JWT_SECRET` fails late,
mid-request. Add a fail-fast config validator and make key rotation safe by construction.

## Context (read first)
- `CLAUDE.md`.
- `.env.example` (the full required-vars list — treat as the schema source).
- `api/_lib/agent-wallet.js` (the WALLET_ENCRYPTION_KEY→JWT_SECRET fallback), `api/_lib/sentry.js` (silently null on bad DSN), Redis requirement (USE-15).
- Key-rotation notes already in `.env.example` (append-to-keyset, never remove mid-rotation).

## Build this
1. **Config schema** — a zod (or equivalent) schema in `api/_lib/config.js` describing every env var: name, required-in-prod?, format, and grouping (db, redis, payments, llm, storage, observability, naming). One typed accessor used everywhere instead of raw `process.env`.
2. **Fail-fast validation** — a startup/health check that, in production, **refuses to serve** (or loudly fails health) if any *critical* secret (`DATABASE_URL`, `JWT_SECRET`, `WALLET_ENCRYPTION_KEY`, x402 facilitator keys, `UPSTASH_*`) is unset/malformed. Non-critical missing vars degrade the related feature with a clear log, not a crash.
3. **Kill the dangerous fallback** — `WALLET_ENCRYPTION_KEY` must be **required and distinct** from `JWT_SECRET` in prod; the implicit fallback is removed (or hard-errors) in production. Document the migration for any existing data encrypted under the old key.
4. **Rotation safety** — support a key *set* (current + previous) for `JWT_SECRET` and `WALLET_ENCRYPTION_KEY` so rotation never breaks live sessions/wallets; add a tiny tool/check that warns if a key in active use is about to be removed.
5. **Tests** — missing critical secret → health fails; malformed value → rejected; wallet encryption refuses JWT_SECRET fallback in prod; rotation keyset decrypts old + new.

## Files likely in play
`api/_lib/config.js` (new), `api/healthz.js`/`status.js` (surface validation), `api/_lib/agent-wallet.js`, `.env.example` (annotate critical vs optional), tests, `docs/security/secrets.md`.

## Definition of done
- [ ] One typed config accessor; raw `process.env` reads removed from app code (or minimized + justified).
- [ ] Prod fails fast on any missing critical secret; non-critical degrade cleanly.
- [ ] `WALLET_ENCRYPTION_KEY` required + distinct in prod; JWT_SECRET fallback gone.
- [ ] Key-set rotation supported + documented; tests cover old+new decrypt.
- [ ] Changelog: **security** entry.

## Guardrails
Follow CLAUDE.md. Never print secret values in logs or errors. Coordinate with prompt 09 (Redis fail-closed). Push both remotes.
