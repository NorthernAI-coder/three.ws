# 08 — Rate limiting & abuse prevention

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Every expensive path on three.ws costs real money: forge generations burn GPU/provider
credits, LLM proxies burn tokens, Solana/Helius/Birdeye reads burn shared API quota,
and x402/payout endpoints move USDC. Unlimited, those become a free attack on the
platform's wallet and a denial-of-service on every honest user. A $1B platform meters
its costly surfaces, makes payments idempotent so a replay can't double-charge, and
stops bots before they scale. This is cost control, fairness, and uptime in one.

## Mission

Ensure every expensive / paid / auth / generation endpoint is rate-limited per
user+IP via the existing `rate-limit.js` registry, payment endpoints are idempotent via
the x402 idempotency cache, and bot/abuse mitigation plus quota tiers are in place —
starting from an inventory of which endpoints currently lack limits.

## Map (trust but verify — files move)

- **Rate-limit registry (build on this — do not re-roll)** —
  [api/_lib/rate-limit.js](../../api/_lib/rate-limit.js): the `limits` object (named
  buckets: `authIp`, `registerIp`, `pumpMetaIp`, `imgProxyIp`, `cohortsIp`, `aixbtIp`,
  `sdpIp`, `avatarPayoutDaily`, …), `clientIp(req)`, and `getLimiter(name, { limit,
  window, critical })` — `critical: true` fails CLOSED in prod (money/cost buckets),
  non-critical fails open. ~418 files already import it.
- **Limit responses** — [api/_lib/http.js](../../api/_lib/http.js): `rateLimited(res,
  result, message)`, `setRateLimitHeaders(res, result)`. Use these so 429s carry the
  standard retry headers.
- **x402 idempotency** — [api/_lib/x402/idempotency-cache.js](../../api/_lib/x402/idempotency-cache.js):
  `hashRequestPayload`, `hashPaymentProof`, `reserve`/`get`/`set`/`release`, `INFLIGHT`,
  `isInflight` (Redis-backed; refuses to boot in prod without Upstash unless
  `X402_ALLOW_MEMORY_FALLBACK=1`). Same id + different payload → 409 Conflict.
- **x402 payment plumbing** — [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js)
  (`paidEndpoint`), [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js),
  [api/_lib/x402-spending-cap.js](../../api/_lib/x402-spending-cap.js),
  [api/_lib/x402/access-control.js](../../api/_lib/x402/access-control.js).
- **Costly endpoints to verify** — [api/forge.js](../../api/forge.js) (generation +
  rigging buckets), [api/chat.js](../../api/chat.js) (LLM proxy), pump/oracle reads
  (Helius/Birdeye), [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js) +
  payout routes, MCP dispatch in [api/_lib/mcp-dispatch.js](../../api/_lib/mcp-dispatch.js).
- **Tests** — [tests/api/http-rate-limited.test.js](../../tests/api/http-rate-limited.test.js),
  [tests/api/chat-proxy-ratelimit.test.js](../../tests/api/chat-proxy-ratelimit.test.js).

## Do this

1. **Inventory unlimited expensive endpoints.** For every handler in `api/`, classify:
   does it cost money (provider/GPU/token/RPC quota), move value (x402/payout/launch),
   gate auth (login/register/reset), or generate (forge/avatar/image/LLM)? `grep -rLn
   "rate-limit\|limits\.\|clientIp" api/` to find handlers in those classes that import
   no limiter. That list is the work queue — produce it explicitly.
2. **Add a named bucket per gap.** For each unlimited costly endpoint, add a bucket to
   the `limits` registry (descriptive name, sensible `limit`/`window`, `critical: true`
   for money/cost paths so a Redis outage fails closed) and enforce it with
   `clientIp(req)` + `rateLimited(res, rl, msg)`. Match the existing per-IP (and
   per-user where authenticated) keying convention.
3. **Per user+IP, not just IP.** Authenticated costly endpoints should key on the user
   id when present (so one user can't rotate IPs) AND fall back to IP for anonymous
   callers. Add a per-resource ceiling where one entity is the cost driver (mirror
   `avatarPayoutDaily` keyed on the wallet, not the caller).
4. **Idempotency on every payment endpoint.** Confirm each x402/paid route uses
   `idempotency-cache.js`: `reserve` before settling, `set` the response, return the
   cached body on replay, and 409 on same-id/different-payload. Any payment route
   without this can double-charge — fix it. Verify the prod no-memory-fallback boot
   check is intact.
5. **Bot / abuse mitigation.** Ensure auth + registration + generation surfaces resist
   scripted abuse: burst + sustained windows (mirror `irlPinBurst` + `irlPinHourly`),
   honeypot/timing on signup, and per-device keying where a device token exists. Confirm
   anonymous generation can't be farmed for free GPU.
6. **Quota tiers.** Wire tiered ceilings (anon < authenticated < $THREE-gated/paid) so
   value flows to holders and paying agents get headroom. Reuse existing tier/gating
   helpers (`three-tier.js`, holder/play passes) rather than inventing a parallel
   system — surface a clear, actionable message when a tier limit is hit.
7. **Test the limits.** Extend `tests/api/http-rate-limited.test.js` and the chat
   ratelimit test to cover each new bucket (burst trips, headers present, critical
   buckets fail closed, idempotency replay returns cached / 409s on mismatch). Run
   `npx vitest run tests/api/http-rate-limited.test.js tests/api/chat-proxy-ratelimit.test.js`.
8. **Verify live + changelog.** `npm run dev`; hammer a newly-limited endpoint and
   confirm a clean 429 with retry headers and helpful copy (not a raw error). Any
   user-visible change (new limit, tier) → `data/changelog.json` entry (tag
   `improvement` or `security`) + `npm run build:pages`.

## Must-not

- Do not hand-roll a counter/limiter — extend the `limits` registry in `rate-limit.js`.
- Do not mark a money/cost bucket non-critical (it would fail open on a Redis outage and
  silently uncap a paid path); do not weaken an existing `critical` bucket.
- Do not skip idempotency on a payment route, and do not enable the in-memory
  idempotency fallback in production (`X402_ALLOW_MEMORY_FALLBACK`) without explicit
  reason.
- Do not return a raw error on a limit hit — use `rateLimited()` with retry headers and
  actionable copy.
- Do not set ceilings so tight they break legitimate interactive use (size each window
  to a real workflow, like the existing buckets do).
- Do not reference any coin other than `$THREE`.

## Acceptance (all true before claiming done)

- [ ] An explicit inventory exists of expensive/paid/auth/generation endpoints; every
      one is now rate-limited via a named `limits` bucket (verified by grep — no costly
      handler lacks a limiter).
- [ ] Authenticated costly endpoints key on user+IP (plus a per-resource ceiling where a
      single entity drives cost); money/cost buckets are `critical` (fail closed).
- [ ] Every payment/x402 endpoint is idempotent via `idempotency-cache.js`: replay
      returns the cached response, same-id/different-payload returns 409; prod
      no-memory-fallback boot check intact.
- [ ] Bot/abuse mitigation (burst + sustained windows, signup protection) and tiered
      quotas (anon < auth < holder/paid) are in place with clear messaging.
- [ ] Limit hits return a clean 429 with retry headers and helpful copy in a real
      browser.
- [ ] Rate-limit + idempotency tests pass with cover for each new bucket; user-visible
      changes logged in `data/changelog.json` and `npm run build:pages` is clean.
