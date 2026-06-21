# 08 — Rate limiting & abuse controls

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** `api/_lib/rate-limit.js` and its call sites; abuse caps on expensive + money + write endpoints.
**Depends on:** `07`. **Pairs with:** `09`, `35` (x402), `21` (forge).

## Why this matters for $1B
Every expensive endpoint (forge GPU, paid x402 verify, pump.fun launches, LLM proxies) is a budget bomb if unbounded — one abuser can run up a five-figure bill or DoS the service. Rate limiting is how the platform survives going viral.

## Map — real anchors
- `api/_lib/rate-limit.js` — Upstash Redis–backed (`@upstash/ratelimit`), in-memory fallback for dev/tests, **fail-closed in prod when Redis unset**. Existing limits: `FORGE_PAID_GLOBAL_HOURLY` (~600/h GPU circuit breaker), `X402_VERIFY_GLOBAL_PER_HOUR` (~12k/h). Returns 429 with `rate_limited` + `retry_after`.
- ~20 handlers already import it (agent-skills, newsletter, forge-*, x402-pay, pump/safety).

## Do this
1. **Inventory expensive/abusable endpoints:** GPU/forge (`api/x402/forge*`, `api/forge*`), LLM proxies, image/3D generation, pump.fun launch/trade, wallet funding, vanity grinding, search, newsletter/signup, anything that writes to DB or spends money. List which already have limits and which don't.
2. **Apply per-IP + per-user limits** to every endpoint on that list, using the existing `rate-limit.js` helper. Tune thresholds to real usage + cost ceilings; keep a **global circuit breaker** on the most expensive lanes (GPU, paid verify).
3. **Graceful 429s:** ensure every limited endpoint returns the standard 429 with `retry_after`, and the **frontend renders it as a designed, friendly "slow down / try again in Ns" state** — not a generic error.
4. **Abuse vectors beyond rate:** signup/email enumeration, content spam in user-generated surfaces (gallery, marketplace, club), referral fraud, free-tier farming. Add the right control (captcha challenge on suspicious patterns, dedupe, holder-gating where appropriate).
5. **Confirm fail-closed:** in production, missing Redis must block (not silently allow unlimited). Verify the startup warning + behavior.
6. Add tests that assert limits trigger and the 429 shape is correct.

## Must-not
- Do not leave any GPU/paid/money/write endpoint unbounded.
- Do not fail open in production when the limiter backend is down.
- Do not surface a raw 429 to users — design the throttle state.

## Definition of done
- [ ] Every expensive/money/write endpoint has per-IP + per-user limits; costliest lanes have a global breaker.
- [ ] 429s carry `retry_after` and render as a friendly frontend state.
- [ ] Limiter fails closed in prod; abuse vectors (enumeration, spam, referral fraud) addressed.
- [ ] Tests cover limit-trigger + 429 shape; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
