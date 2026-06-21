# 10 — Observability & alerting

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** `api/_lib/sentry.js`, server + client error capture, structured logging, ops alerts, `api/healthz.js`.
**Depends on:** `06`. **Pairs with:** `09`, `47` (status page).

## Why this matters for $1B
You can't operate at scale blind. When money moves and avatars render for thousands of
users, you need to know within seconds that something broke, where, and how badly. Good
observability turns 3am outages into 3-minute fixes — and gives investors confidence the
team can run the thing.

## Map — real anchors
- `api/_lib/sentry.js` — custom HTTP envelope (no `@sentry/node`, to avoid NFT bloat); `SENTRY_DSN` configures; fired by `serverError()` in `api/_lib/http.js`; 2.5s timeout.
- `api/_lib/http.js` — redacts lat/lng/token before logs/Sentry.
- `public/error-reporter.js` → `POST /api/client-errors` — batched client capture.
- `api/healthz.js` → `GET /api/healthz` — uptime + sub-probe status (resend/x402/monitor/watches).

## Do this
1. **Structured server logs:** standardize log lines into a structured shape (level, route, request id, user/agent id where safe, latency, outcome) via a small helper in `api/_lib/`. Keep the existing redaction. Replace ad-hoc `console.log` on hot paths with it.
2. **Error capture coverage:** confirm **every** `serverError()` path reports to Sentry and every unhandled client error reaches `/api/client-errors`. Add a request id that ties a client error to its server trace.
3. **Money + auth events:** emit a durable audit log (DB-backed where it exists) for every payment, withdrawal, mint, gating decision, and authz denial — queryable after the fact (coordinate with x402 audit-log in `api/_lib/x402/`).
4. **Alerting:** wire ops alerts (the existing alert path in `http.js`) for: payment failures, auth-denial spikes, upstream-failover events, rate-limit-breaker trips, healthz sub-probe failures. Route to a real channel (Telegram/Slack/email) using existing creds.
5. **Health/metrics:** extend `api/healthz.js` to cover the dependencies that matter (DB, Redis, RPC, model providers) with cached sub-probes. Expose key counters (paid calls/hr, forge jobs, errors/min) for the status page (`47`).
6. **Dashboards:** document where to watch (Vercel Observability + Sentry) in `docs/internal/runbook.md`; add a minimal runbook for the top 5 alerts.

## Must-not
- Do not log secrets, full wallet keys, or precise user location — keep the redaction.
- Do not add a heavy SDK that bloats the serverless bundle — match the lightweight `sentry.js` approach.

## Definition of done
- [ ] Structured logging helper in use on hot/money/auth paths, with redaction intact.
- [ ] Every server + client error is captured and correlatable via request id.
- [ ] Durable audit log for payments/withdrawals/mints/gating/authz-denials.
- [ ] Real alerts wired for the critical event classes, with a runbook.
- [ ] `healthz` covers DB/Redis/RPC/model providers; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
