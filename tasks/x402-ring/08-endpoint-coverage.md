# Task 08 — Full Catalog Coverage: Every Tip, Payment, and Service Actually Settles

## Mission

The economy is only "working" if the whole catalog works — tips, payments,
services bought and sold — not just `ring-settle`. Today the rotation covers 12
of ~35 paid endpoints, and nobody has proven the other 23 settle correctly when
actually paid. Exercise EVERY paid endpoint end-to-end with a real settlement,
fix every one that fails, and wire the full catalog into the rotation so
coverage is continuous, not a one-time audit.

## Context you must know

- Full paid-endpoint inventory (slug → default price → file):
  ring-settle $1.00 `api/x402/ring-settle.js`; pump-launch $5.00
  `api/x402/pump-launch.js`; mint-to-mesh-batch + billboard $0.05
  (`api/x402/mint-to-mesh-batch.js`, `api/x402/billboard.js`);
  pump-agent-audit $0.02; $0.01 tier: endpoint-shopper-run,
  unstoppable-status (`api/agents/…`), three-intel, crypto_intel, token-intel,
  agent-reputation, club-cover, agent-bouncer, spend-session; $0.005 tier:
  cross_chain_bridge_status, analytics, symbol-availability-batch,
  onchain-identity-verify; $0.001 tier: dance-tip, skill-marketplace,
  symbol-availability, telegram-health, api-key-health, did_verify, notify,
  bazaar-feed, auth_health, model-validation-sweep, rate-limit-probe,
  wallet-connect-health, solana-register-health, feed-health, schema-check,
  permit2-paid-demo; plus cosmetic-purchase (own pricing module). All priced
  via `priceFor(slug, default)` (`api/_lib/x402-prices.js:25`, env override
  `X402_PRICE_<SLUG>`); all USDC (`$THREE` optional second accept via
  `X402_ACCEPT_THREE_SOLANA` — leave that flag alone).
- Current rotation: `VOLUME_ENDPOINTS` (`volume-bootstrap-loop.js:70-88`) — 12
  entries including a `fact-check` and `pay-by-name` — verify those two resolve
  to live paths; the map may be stale.
- Buyer primitive: `payX402` (`api/_lib/x402/pay.js:141-`). A2A service flows:
  `api/x402/service.js`, `api/_lib/x402/a2a-server.js` / `a2a-client.js`,
  manifest/invoke `api/agents/x402/[action].js`.
- Task 04's ring tick consumes the catalog you produce here.

## Tasks

1. **Canonical catalog module.** Create `api/_lib/x402/ring-catalog.js`: one
   exported array of `{slug, path, method, body(), priceAtomicDefault, tier,
   kind}` where `kind ∈ tip|service|intel|health|commerce|settle`, covering
   EVERY paid endpoint above. `body()` must produce a real, valid request body
   per endpoint (read each handler to learn its contract — no guessing, no
   empty bodies that 400). Endpoints that are genuinely unsafe to auto-buy
   (e.g. `pump-launch` mints a real coin — $5 and an on-chain artifact per
   call) get `autobuy:false` with a comment saying why; they are still covered
   by the one-time verification in step 2, on devnet or with explicit owner
   sign-off.
2. **Prove every endpoint settles.** Env-complete, self-facilitator on, funded
   payer (tiny amounts — the whole sweep at default prices costs ≈ $0.30 for
   the autobuy set): for each catalog entry, `payX402` it once. Record: 402
   challenge OK → payment accepted → facilitator settle signature → 200
   business response with real (non-stub) payload. Produce
   `tasks/x402-ring/COVERAGE.md` — a table: slug, price, settle signature,
   response OK, notes.
3. **Fix what fails.** Every endpoint that 500s, returns a stub, mis-prices,
   drops its Solana accept, or fails settlement gets fixed in this task — read
   the handler, fix the root cause, re-run, update COVERAGE.md. No endpoint is
   skipped without an `autobuy:false` justification. (Concurrent-agent
   caution: if a fix touches a file another task owns, coordinate via the
   smallest possible diff — the catalog + endpoint handlers are yours; the
   payment/pipeline plumbing is not.)
4. **Wire rotation to the catalog.** Replace the hardcoded `VOLUME_ENDPOINTS`
   and the ring tick's list with imports of `ring-catalog.js` filtered by
   `autobuy && tier`, weighted so every autobuy endpoint is exercised **at
   least once per hour** at default cadence (do the math against task 04's
   calls/minute; the catalog defines weights, the tick owns the loop). Delete
   the stale duplicate list.
5. **Tips and commerce are load-bearing.** dance-tip, club-cover, billboard,
   cosmetic-purchase, skill-marketplace are the "tips and services bought and
   sold" the owner named: confirm each writes its real business effect (tip
   recorded, cover charged, listing purchase recorded) — not just the payment
   log — and add the assertion to COVERAGE.md.
6. **Tests.** Catalog schema test (every entry has valid path/price/kind;
   `body()` returns parseable JSON); rotation-coverage test (every autobuy slug
   appears within a simulated hour); stale-path test (every `path` resolves to
   a file under `api/`).
7. **Docs + changelog.** `docs/x402-ring-economy.md`: replace the 12-endpoint
   mention with the catalog reference + coverage guarantee. Changelog entry
   (tags: `feature`, `improvement`).

## Files you own

`api/_lib/x402/ring-catalog.js` (new), `api/_lib/x402/pipelines/volume-bootstrap-loop.js`
(list → catalog import only), endpoint handler fixes under `api/x402/` +
`api/agents/`, `tasks/x402-ring/COVERAGE.md`, tests,
`docs/x402-ring-economy.md`, `data/changelog.json`.

## Constraints

- Payments only from the ring payer to our own endpoints; total verification
  spend ≤ $2 without owner sign-off (the autobuy sweep is ~cents; `pump-launch`
  and other `autobuy:false` entries need explicit approval or devnet).
- Fixing an endpoint must not change its public price without a changelog note.
- No endpoint gets a mock response to "pass" — the business effect must be real
  (CLAUDE.md hard rules apply).
- `bazaar.discoverable` flags stay as they are — ring-settle stays
  `discoverable:false`.

## Acceptance criteria

- [ ] `ring-catalog.js` covers 100% of paid endpoints (count asserted in test
      against a grep of `paidEndpoint(` usages — new endpoints fail the test
      until cataloged).
- [ ] COVERAGE.md shows a real settle signature + verified business effect for
      every autobuy endpoint, and a justification for every `autobuy:false`.
- [ ] Rotation guarantees hourly coverage (test-proven).
- [ ] All endpoint fixes listed with root cause, one line each.
- [ ] `npm test` green; docs + changelog landed.
