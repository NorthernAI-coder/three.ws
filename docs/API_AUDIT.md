# API Audit — three.ws

_Date: 2026-06-18 · Scope: all 876 `.js` files under [`api/`](../api) (Vercel serverless functions) + the `_lib` helpers they import._

This audit was run subsystem-by-subsystem against the [CLAUDE.md](../CLAUDE.md) operating
rules and standard API hardening criteria: no mocks/fake data, real APIs only,
errors handled at boundaries, every path wired, auth + CSRF + rate-limit on the
right routes, no secret/internal leakage, and the **`$THREE`-only** coin rule.

The codebase is, overall, **mature and well-defended** — SIWE/SIWS nonce handling,
the x402 spec, on-chain payment verification, SSRF guards, cron-secret auth, and
webhook signature checks are all correct. Findings cluster into a handful of
**systemic patterns** rather than one-off bugs. Fixing the patterns at their
shared seams (the `wrap()` boundary, the `requireCsrf` convention) clears most of
the surface at once.

## Severity summary

| Severity | Count | Theme |
|---|---|---|
| CRITICAL | 1 | Fabricated sample avatars shipped into the live public discovery feed |
| HIGH | ~30 | (a) raw upstream `err.message`/body leaked in 5xx — **leaks the Helius API key**; (b) missing CSRF on cookie-session mutations; (c) payment-correctness races; (d) missing rate limits; (e) two dead/always-failing oracle routes; (f) SSRF gaps |
| MEDIUM | ~25 | retired model IDs, public PII leak, idempotency gaps, validation gaps |
| LOW | ~20 | response-shape inconsistencies, header omissions, hygiene |

**Coin policy: CLEAN.** No reference to any coin/token/mint other than `$THREE`
anywhere in the API. The only hardcoded mints are USDC and native/wrapped SOL
(payment-rail plumbing, explicitly allowed) and the canonical `$THREE` CA.

---

## Systemic patterns (fix these first — highest leverage)

### P1 — Raw 5xx error leakage (security: leaks `HELIUS_API_KEY`)

`wrap()` ([api/_lib/http.js:284](../api/_lib/http.js#L284)) returns `err.message`
verbatim for any uncaught `status >= 500`, and dozens of catch blocks call
`error(res, 500, code, e.message)` directly. Solana/web3.js network errors embed
the full RPC URL — `https://mainnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>` —
so a single upstream RPC failure spills the platform's Helius key to the client.
Other leaks expose Alchemy/Bonfida/GraphQL/SDK internals.

**Fix:** route every `status >= 500` through `serverError()` (which already
sanitizes to a correlation ref + logs detail server-side). One change in `wrap()`
covers all uncaught 5xx; the explicit-`error()` 5xx call sites that leak a keyed
URL are fixed individually.

Worst offenders (keyed-URL leak): [api/pump/[action].js:273,4651,4697](../api/pump/[action].js),
[api/coin/[mint]/cohorts.js:113](../api/coin/[mint]/cohorts.js#L113),
[api/tx/explain.js:48,83](../api/tx/explain.js). Plus ~20 lower-sensitivity
leaks across agents/, bazaar/, skills/, marketplace/, scene/, nft/, inference/.

### P2 — Missing CSRF on cookie-session mutations

The platform convention (e.g. [api/api-keys/[id].js](../api/api-keys/[id].js),
[api/x/post.js:21](../api/x/post.js#L21)) is: any state-changing request authed by
the `__Host-` session cookie must pass `requireCsrf`. Bearer-token callers are
auto-exempt. A cluster of mutating routes omit it:

- [api/permissions/[action].js](../api/permissions/[action].js) grant/revoke (on-chain delegation)
- [api/developer/webhooks.js](../api/developer/webhooks.js) create, [api/developer/webhooks/[id].js](../api/developer/webhooks/[id].js) PATCH/DELETE
- [api/dashboard/prefs.js](../api/dashboard/prefs.js) POST/PATCH
- [api/billing/payout-wallets/[id].js](../api/billing/payout-wallets/[id].js) DELETE
- [api/marketplace/set-skill-price.js](../api/marketplace/set-skill-price.js), [api/marketplace/asset-price.js](../api/marketplace/asset-price.js), [api/marketplace/purchase-as-agent.js](../api/marketplace/purchase-as-agent.js)
- [api/notifications/[id]/read.js](../api/notifications/[id]/read.js), [api/notifications/read-all.js](../api/notifications/read-all.js)
- [api/developer/mcp-test.js](../api/developer/mcp-test.js)
- [api/x/schedule.js](../api/x/schedule.js), [api/x/status.js](../api/x/status.js), [api/x/triggers.js](../api/x/triggers.js), [api/x/reviews.js](../api/x/reviews.js)

**Fix:** add the one-line `requireCsrf` guard (session-authed branches only).

### P3 — Missing rate limits where a dedicated limiter already exists

- [api/auth/wallets/[action].js](../api/auth/wallets/[action].js) — `limits.walletLink` is defined but never called on nonce/link/takeover.
- [api/auth/github/[action].js](../api/auth/github/[action].js) — no limiter on connect/callback (the X flow has one).
- [api/oauth/[action].js](../api/oauth/[action].js) — `authorize` unthrottled.
- Money-moving admin actions ([api/admin/withdrawals/[id].js](../api/admin/withdrawals/[id].js), [api/admin/bulk-launch.js](../api/admin/bulk-launch.js), [api/admin/register-agents.js](../api/admin/register-agents.js)).

---

## CRITICAL

| # | File | Issue | Fix |
|---|---|---|---|
| C1 | [api/_lib/demo-avatars.js](../api/_lib/demo-avatars.js) → consumed by [explore.js](../api/explore.js), [explore-item.js](../api/explore-item.js), [discover-detail.js](../api/discover-detail.js) | A hardcoded fabricated `DEMO_AVATARS` array (invented authors/dates, generic glTF samples dressed as real community avatars) is injected into the **live public** discovery feed, counted into public totals, and served as detail/OG pages. Direct violation of the no-fake-data rule. | Stop injecting the fixture into production responses; serve only real DB rows. Keep it strictly for empty-state local dev if at all. |

---

## HIGH (selected — full list tracked in fixes below)

| # | File:line | Issue | Fix |
|---|---|---|---|
| H1 | [api/x402-pay.js:715](../api/x402-pay.js#L715) + [agent-trade-guards.js:409](../api/_lib/agent-trade-guards.js#L409) | Daily-cap race on agent pay path: `SELECT SUM` then settle, spend recorded fire-and-forget after settle → concurrent payments overspend the ceiling. | Reserve-first in the ledger before signing (mirror `x402-spending-cap.js`). |
| H2 | [api/subscriptions/index.js:99](../api/subscriptions/index.js#L99) | Subscription flipped to `active` with a full period **before** payment confirms; charge only inserts a pending intent. Free access. | Grant the active period only after the tx confirms. |
| H3 | [api/x402/crypto-intel.js:166](../api/x402/crypto-intel.js#L166), [api/x402/three-intel.js:156](../api/x402/three-intel.js#L156) | On upstream failure a **paying** caller gets a 200 with fabricated `signal:'neutral'` and a false "estimated from trend memory" provenance; settle proceeds → charged for invented data. | Throw `err.status=502` on live-data failure so settle never runs; delete the false rationale. |
| H4 | [api/_lib/royalty.js:84](../api/_lib/royalty.js#L84) | `settleRoyalties` redeems on-chain then UPDATEs unconditionally → concurrent runs double-pay. | Claim rows atomically (`UPDATE…SET status='settling' WHERE status='pending' RETURNING`) before redeeming. |
| H5 | [api/agents/by-address/[addr].js:78](../api/agents/by-address/[addr].js#L78) | `MAX_ENUM=50` defined but never applied — enumerates full balance into thousands of RPC calls. | Slice to `MAX_ENUM`, set `truncated`. |
| H6 | [api/oracle/social.js:62](../api/oracle/social.js#L62) | `limits.moderate` is `undefined` → `rateLimited` fires on every request; the ingest endpoint is permanently 429 (dead). | Use a real limiter (`limits.publicIp`). |
| H7 | [api/oracle/follow.js:40](../api/oracle/follow.js#L40) | Per-branch `method(...,['GET'])` 405s every POST/DELETE → subscribe/unsubscribe are dead routes; `readJson(req,res)` disables the size cap. | Branch on `req.method`; call `method` once with all verbs; fix `readJson`. |
| H8 | [api/_lib/vision.js:108](../api/_lib/vision.js#L108) | `describeImage` forwards caller `imageUrl` to the model server with no SSRF check; any non-forge consumer can reach internal targets. | Validate scheme/host in `imagePart()`. |
| H9 | [api/users/[username].js:272](../api/users/[username].js#L272) | Public endpoint returns every user's `referral_code` → referral-code harvesting. | Drop `referral_code` (and re-check `wallet_address`) from the public payload. |
| H10 | [api/nft/mint-scene.js:14](../api/nft/mint-scene.js#L14) | Uses the retired nft.storage classic `/upload` API (dead upstream → mints fail); unbounded base64 blob into memory. | Migrate to the storage provider used in `avatars/[id]/[action].js`; cap bytes. |
| H11 | [api/agents/payments/[action].js:498](../api/agents/payments/[action].js#L498) | Fund-adjacent distribute/withdraw prep+confirm have no rate limit and resolve agent by mint with no ownership gate. | Add `limits.authIp`; assert `agent.user_id === auth.userId`. |
| H12 | [api/tx/explain.js:27](../api/tx/explain.js#L27), [api/tx/solana/[action].js:54](../api/tx/solana/[action].js#L54) | No base58/hex validation on `sig`/mint before forwarding to keyed upstreams. | Validate before fetch. |

## MEDIUM (selected)

| # | File | Issue | Fix |
|---|---|---|---|
| M1 | [api/agents/talk.js:26](../api/agents/talk.js#L26) | `ALLOWED_MODELS` includes retired `claude-3-5-haiku-20241022` (404s at provider). | Replace with `claude-haiku-4-5`. |
| M2 | [api/brain/chat.js:102](../api/brain/chat.js#L102) | Haiku 4.5 OpenRouter mirror points at retired `anthropic/claude-3.5-haiku`. | Update to current Haiku 4.5 id. |
| M3 | [api/_lib/x402-spending-price.js:86](../api/_lib/x402-spending-price.js#L86) | Cap under-counted via attacker-labeled `USDC`/inflated `decimals` in the 402 challenge. | Derive decimals/classification from the on-chain mint / trusted registry. |
| M4 | [api/payments/solana/[action].js:118](../api/payments/solana/[action].js#L118) | `confirmPayment` UPDATE not conditional on `status='pending'`; no cross-intent tx replay guard (EVM path has one). | Conditional UPDATE + unique `(chain_type, tx_hash)`. |
| M5 | [api/agenc/[action].js:422](../api/agenc/[action].js#L422) | Top-level catch returns raw `err.message` in 500. | Route through `serverError`. |
| M6 | [api/avatar/optimize.js:160](../api/avatar/optimize.js#L160) | Expensive transcode, no auth/rate-limit; redirect not re-validated per hop. | Add limiter; `redirect:'manual'` + re-validate. |
| M7 | [api/auth/github/[action].js:45](../api/auth/github/[action].js#L45) | OAuth `state` not bound to a per-browser cookie → account-injection within the 10-min window. | Bind state to a `__Host-` cookie. |
| M8 | [api/billing/withdrawals/index.js:14](../api/billing/withdrawals/index.js#L14), [api/billing/withdrawals/[id].js:18](../api/billing/withdrawals/[id].js#L18) | `currency_mint` free-text, unvalidated; `id` not UUID-validated → 500 on bad input. | Allow-list mints; validate UUID → 400. |

## LOW (themes)

- Response-shape inconsistencies: [widgets/[id]/duplicate.js](../api/widgets/[id]/duplicate.js) skips `decorate()`; [agent-economy/status.js](../api/agent-economy/status.js) bypasses `json()` (drops security headers).
- 429s via raw `error()` instead of `rateLimited()` (drops `RateLimit-*` headers): [coin/[mint]/cohorts.js:91](../api/coin/[mint]/cohorts.js#L91).
- [feature-og.js:70](../api/feature-og.js#L70) `escapeXml` omits single-quote.
- [admin/news/[action].js:28](../api/admin/news/[action].js#L28) allows `svg` upload (stored-XSS).
- [admin/user/[id].js:84](../api/admin/user/[id].js#L84) privilege changes not audit-logged.
- [healthz.js:191](../api/healthz.js#L191) leaks git SHA / config booleans.
- [_lib/pii.js:11](../api/_lib/pii.js#L11) redaction misses JWT/`ghp_`/`xox`/AWS key shapes.
- Headless render loads three.js from `unpkg.com` at render time ([_lib/render-clip.js:72](../api/_lib/render-clip.js#L72)).

---

## Verified-clean (no action)

- **Coin policy** — `$THREE` only; USDC/SOL are payment plumbing.
- **No mocks/TODOs/stubs/fake-loading** outside C1 — all `setTimeout` are real async (backoff/SSE keepalive/confirmation polling).
- **SIWE/SIWS, OAuth/PKCE, x402 spec, on-chain payment verification, withdrawals (advisory-lock + conditional insert), SSRF guards, cron-secret auth, webhook signatures, admin `requireAdmin` gating, parameterized SQL** — all correct.

---

## Fix plan (execution order)

1. **P1 boundary** — sanitize `wrap()` 5xx + the keyed-URL leak sites. _(security)_
2. **C1** — remove `DEMO_AVATARS` from production responses. _(rule violation)_
3. **H6/H7** — repair the two dead oracle routes. _(broken functionality)_
4. **M1/M2** — retired model IDs. _(broken functionality)_
5. **H9** — stop leaking referral codes. _(PII)_
6. **P2** — CSRF cluster. _(security)_
7. **P3 + H11** — rate-limit gaps. _(abuse)_
8. **H3/H4/H2/H1/M4** — payment correctness. _(money)_
9. **H5/H8/H12/M6** — enumeration cap, SSRF, input validation.
10. Remaining MEDIUM/LOW hygiene.

Each fix is verified against `npm test` and the existing helper conventions; no
behavior is mocked, stubbed, or left half-wired.
