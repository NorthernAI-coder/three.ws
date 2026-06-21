# 35 — Pricing & monetization surfaces

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Revenue is the proof a platform is worth $1B. A visitor must understand what's free,
what costs, and exactly what they get for the money — in seconds, with no surprise
charges. three.ws monetizes two ways: a public pricing page (Free + paid generation)
and per-call x402 micropayments priced from a single catalog. If costs are opaque,
inconsistent across surfaces, or ever leak a vendor's billing internals, trust and
conversion both collapse.

## Mission

Make pricing and monetization clear, consistent, and value-aligned everywhere: one
source-of-truth catalog driving the pricing page, the x402 pay-per-call flow, and the
`/pay` surface, with transparent costs, honest upgrade paths, and zero vendor billing
exposure.

## Map (trust but verify — files move)

- **Pricing catalog (source of truth)** — [api/_lib/pricing/catalog.js](../../api/_lib/pricing/catalog.js)
  (`CATALOG`, `publicCatalog()`, `priceForAction()`, `catalogEntry()`; prices in USD,
  settled in `$THREE`; Forge tier prices READ from `forge-tiers.js`, not duplicated),
  [api/_lib/pricing/charge-three.js](../../api/_lib/pricing/charge-three.js),
  [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js) (free draft tier on NVIDIA NIM).
- **Public pricing page** — [pages/pricing.html](../../pages/pricing.html) (`/pricing`),
  [public/pricing.css](../../public/pricing.css). Has a Free tier ("$0/forever, no
  credit card") + paid tiers in `#pricing-tiers`.
- **x402 pay surfaces** — [public/pay/index.html](../../public/pay/index.html) (`/pay`),
  [public/pay/calls/index.html](../../public/pay/calls), [public/pay/c/index.html](../../public/pay/c),
  the buyer modal in [api/x402-checkout.js](../../api/x402-checkout.js) +
  [public/x402-checkout.js](../../public/x402-checkout.js),
  [public/x402-pay-core.js](../../public/x402-pay-core.js).
- **Paid endpoints (catalog consumers)** — [api/x402/](../../api/x402) (e.g.
  `forge.js`, `skill-call.js`, `service.js`, `mint-to-mesh.js`),
  [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js),
  [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js).
- **Conversion instrumentation** — [src/analytics.js](../../src/analytics.js)
  (`token_*` and CTA events). Trading/PnL disclaimers live with the market surfaces
  (prompt `22-*`).

## Do this

1. **Map every price to the catalog.** Confirm `pages/pricing.html` and every `/pay`
   surface read from `api/_lib/pricing/catalog.js` (or `publicCatalog()` over an
   endpoint) — no hardcoded dollar amounts duplicated in HTML/JS that can drift from
   the catalog. Where a number is hardcoded today, wire it to the catalog or document
   why it's a fixed marketing figure.
2. **Walk the buyer flow in a browser** (`npm run dev`): `/pricing`, then a real
   per-call purchase via the `/pay` modal (`x402-checkout.js`). Confirm the quote is
   shown in USD with the `$THREE` settle amount, costs are explicit before signing,
   and the success/receipt state is clear (link to `my-receipts`).
3. **Never expose vendor billing.** Audit every error path in the pay/x402 chain: a
   provider quota/credit/billing message, raw 402/429/5xx body, or vendor URL must be
   masked to neutral, actionable copy ("Payment couldn't complete — try again");
   server logs keep the detail. This is a hard `/CLAUDE.md` rule.
4. **Value-metric alignment.** Make the unit of charge obvious and tied to value
   delivered (per generation / per call / per tier), not opaque "credits" with no
   anchor. If a credits model is shown, it must convert transparently to the same
   catalog prices.
5. **Design every state on the pay surfaces:** loading (quote fetching), empty (no
   wallet connected → connect path), error (masked, retryable), and success
   (receipt). The free tier must be clearly the default with no card required.
6. **Honest upgrade paths.** From the free Forge draft, the path to Standard/High (and
   from a free agent to monetizing it) must be discoverable and benefit-led, never a
   nag or a forced wall in front of the free aha. No dark patterns (no fake scarcity,
   no pre-checked add-ons, no hidden recurring charges).
7. **Instrument conversion.** Fire the existing `token_*` / CTA taxonomy events
   through `src/analytics.js` on pricing views, buy intent, quote shown, and settle —
   no raw wallet/PII (use `shortWallet()`).
8. **Test + changelog.** Run the pricing/x402 tests (`npx vitest run` over
   `tests/**/x402*`, `tests/**/pricing*`, `tests/**/forge-tiers*` as present), add a
   `data/changelog.json` entry for any user-visible pricing change, and run
   `npm run build:pages`.

## Must-not

- Do not surface any third party's billing page, credit balance, quota text, or raw
  error to a buyer — mask to neutral copy, log detail server-side.
- Do not duplicate prices: the catalog (`api/_lib/pricing/catalog.js`) is the single
  source of truth; surfaces read from it.
- Do not use dark patterns — no fake scarcity/countdowns, pre-checked upsells, hidden
  recurring charges, or a wall in front of the free aha.
- Do not reference, price, or settle in any coin other than `$THREE` (USD is the quote
  unit; `$THREE` is the settle unit).
- Do not show a trading/PnL/market figure without the required disclaimer.

## Acceptance (all true before claiming done)

- [ ] `/pricing` and every `/pay` surface read prices from the catalog; no drifting
      hardcoded amounts.
- [ ] A real per-call purchase completes in-browser with USD quote + `$THREE` settle
      shown before signing and a clear receipt after.
- [ ] Every pay/x402 failure mode yields neutral, actionable copy — no vendor billing
      internals — verified by tests.
- [ ] Free tier is the obvious default (no card); upgrade paths are benefit-led with
      no dark patterns.
- [ ] Loading/empty/error/success states designed on the pay surfaces; no console
      errors/warnings.
- [ ] Conversion events fire through the taxonomy with no PII.
- [ ] Pricing/x402 tests pass; changelog entry added and `npm run build:pages` clean.
