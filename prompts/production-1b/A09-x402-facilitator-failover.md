# A09 — x402 facilitator failover + self-hosted fallback + admin health/metrics

> Phase A · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Every paid call settles through an external x402 facilitator. Today there's a facilitator
list but no failover: if the primary (PayAI) is down, settlements 5xx and revenue stops.
Add ordered failover, a self-hosted fallback so three.ws never fully depends on a third
party, and the health/metrics to see settlement reliability.

## Where this lives (real files)
- `api/_lib/x402/bazaar-client.js` — `DEFAULT_FACILITATORS` list, discovery, schema normalization.
- `api/_lib/x402/a2a-server.js` / `a2a-client.js` — payment verify/settle.
- `api/_lib/x402/audit-log.js` — settlement ledger.
- `api/x402/*.js` — paid endpoints.

## Current state & gaps
- `verifyPayment()`/settlement targets a single facilitator with no fallback.
- No facilitator health check; a facilitator outage looks like a platform outage.
- No self-hosted `/verify` `/settle` `/supported` path as a last resort.

## Build this
1. **Ordered failover:** in the verify/settle path, try facilitators in priority order with a bounded timeout each; on failure, fall through to the next and log which failed. Never block revenue on one provider.
2. **Self-hosted facilitator fallback:** deploy a minimal in-repo `/api/x402/facilitator/{verify,settle,supported}` that can verify + settle the `exact` scheme on Solana mainnet directly via our RPC, used as the final fallback. Guard it behind the same caps/audit as everything else.
3. **Health + metrics:** `GET /api/admin/x402-health` (auth) checks every configured facilitator's `/supported`; `GET /api/admin/x402-metrics` shows settlement success rate, volume (daily/weekly/monthly), top endpoints, top payers, and facilitator error counts.
4. **Alerting:** if settlement success rate drops below a threshold or a facilitator is down, alert ops once per incident.
5. **Idempotency preserved:** failover must not double-settle — reuse the existing `idempotency-cache.js` keyed on payment identifier across providers.

## Out of scope
- Pricing (**A07**) and metering (**A08**).

## Definition of done
- [ ] Settlement fails over across facilitators and finally to the self-hosted path; proven by forcing the primary to fail.
- [ ] Self-hosted facilitator verifies + settles a real Solana `exact` payment.
- [ ] `/api/admin/x402-health` + `/api/admin/x402-metrics` return real data; low-success alert fires.
- [ ] Idempotency holds across failover (no double-settle) — tested.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Point the primary facilitator at a dead URL → settlements still succeed via fallback; health shows the primary down.
