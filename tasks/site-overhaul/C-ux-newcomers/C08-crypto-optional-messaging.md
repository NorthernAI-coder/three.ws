# C08 — "Crypto is optional" messaging, promoted everywhere

**Track:** UX for Newcomers · **Size:** S · **Priority:** P2

## Goal
Surface the (currently buried) truth that the core product works with no wallet, and frame every
crypto feature as explicit opt-in across the site.

## Why it matters
The audit found a great FAQ answer — "Do I need crypto to use three.ws? No…" — buried in
`/pricing`. Promoting it removes the single biggest false barrier for normal users.

## Context
- Source copy: [pages/pricing.html](pages/pricing.html) FAQ ("The web component, dashboard, and API work without a wallet. Crypto unlocks: on-chain identity, payable skills, payouts.").
- Crypto features should read as optional add-ons, not prerequisites.

## Scope
- Add a concise, consistent "No crypto required to start — it's optional" message to: homepage (C01), `/features` (C05), the create flow, and the dashboard first-run.
- Wherever a crypto action appears, label it "Optional" with a one-line plain benefit + a "what's this?" tooltip (C04).
- Keep the message honest and identical in tone everywhere (one reusable snippet/component).

## Definition of done
- The "crypto is optional" message appears on the top entry surfaces; every crypto action is labeled optional with a plain benefit.

## Verify
- A non-crypto user, on home/features/create/dashboard, can plainly see they can use the product without a wallet.
