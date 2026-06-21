# D4 — Marketplace Economics: Fees, Royalties, Splits & On-Chain Licenses

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
`D1-three-holder-value-system.md` (creator/buyer tier perks) and ideally
`D2-billing-pricing-metering.md` (payouts reconcile against D2's ledger).

## Why this matters for $1B

A marketplace is worth a multiple when creators **trust it with their money**. That means a
fee they can see, a royalty they reliably receive, a split that pays every collaborator their
exact share, a payout they can withdraw, and — where possible — a license whose terms are
enforced **on-chain** so nobody has to trust an off-chain ledger. Creators who get paid
correctly, every time, bring more creators; that supply is the network effect. A skill license
that mints and enforces trustlessly is the kind of primitive an acquirer underwrites as
defensible IP. This prompt turns "we take a fee somewhere" into a transparent, trustless
creator economy.

## Current state (read before you write)

- `api/_lib/marketplace-platform-fee.js` — the platform fee on a skill purchase: a **real**
  on-chain USDC transfer appended to the buyer's single transaction, routed to the treasury;
  fee comes out of the listed price, creator nets the remainder, buyer total never marked up;
  ships inert when no treasury wallet or rate is configured. Read its honesty contract — the
  purchase response surfaces a `fee` block.
- `api/_lib/royalty.js` — `billSkillRoyalty` (records a `royalty_ledger` debit after a paid
  skill returns) and `settleRoyalties` (the settle-royalties cron; redeems EIP-7710
  delegations, marks ledger rows settled/failed). EVM USDC, viem.
- `api/_lib/payout.js` — `resolvePayoutAddress(agentId, chain)`; `api/billing/payout-wallets/`,
  `withdrawals/`. `api/_lib/vanity-bounty-payout.js` — an existing payout pattern.
- `contracts/skill-license/` — an Anchor (Solana) program (`src/`, `Anchor.toml`,
  `README.md`, `DEPLOYMENT.md`). `api/_lib/skill-license-onchain.js` — the client that reads/
  writes the on-chain license. `api/creators/[id].js`, `api/creators/skill-analytics.js`.
- **The dep `@0xsplits/splits-sdk` is in `package.json` but grep shows NO import** — payment
  splits among multiple collaborators are not yet wired. That's the headline gap.
- **The gap:** fee + royalty + payout each work in isolation; multi-party **splits** don't
  exist; the on-chain skill license isn't wired into the purchase/enforcement path end-to-end;
  creators lack a single "what I earned, what split where, what I can withdraw" surface.

## Your mission

### 1. Payment splits — wire `@0xsplits/splits-sdk` for multi-collaborator skills
Build `api/_lib/splits.js` so a skill or asset with multiple contributors pays each their exact
share atomically. Use `@0xsplits/splits-sdk` to create/resolve an immutable (or mutable-by-
owner) split contract per multi-party listing, and route the creator's net (after platform fee)
into the split so 0xSplits handles the on-chain distribution — **trustless, no custody**. A
single-creator listing pays the creator directly (no split overhead). The split allocation is
set by the creators at listing time and shown to the buyer ("proceeds split: 70/30"). Handle
the no-split and the N-way cases; validate shares sum to 100%.

### 2. Make platform fee + royalty + split one coherent settlement
Today fee (Solana, in-tx) and royalty (EVM, delegated) are separate. Define the canonical
money flow for a marketplace purchase: buyer pays `price` → platform fee out → creator net →
(if multi-party) into the 0xSplits contract → recorded in `royalty_ledger` / D2's
`usage_events`. Every hop is on-chain or ledgered; the purchase response surfaces the full
breakdown (price, fee, creator net, split recipients) — no hidden cut (CLAUDE.md Rule 1 & 9).
Reuse `marketplace-platform-fee.js`'s honesty contract; don't fork a second fee module.

### 3. Wire the on-chain skill license end-to-end
Connect `contracts/skill-license/` + `api/_lib/skill-license-onchain.js` into the purchase
path: a purchase mints/records an on-chain license proving the buyer's right to call the skill,
and the skill executor **verifies the on-chain license** (or a signed proof of it) before
running — so entitlement is enforced trustlessly, not just by a database row. Follow
`DEPLOYMENT.md` for the deployed program ID / env. Where the program isn't deployed in an
environment, the path degrades to the ledger check and never fakes an on-chain license.

### 4. Creator payouts — a real withdraw flow
Make `api/billing/withdrawals/` + `payout.js` a complete withdraw experience: a creator sees
their settled balance (from the royalty ledger + split distributions), picks a payout wallet
(`payout-wallets/`), and withdraws real USDC on a real chain. Idempotent (no double-payout on
retry — 00b reliability bar), with a clear pending → settled → failed status and a tx link.
Design the empty state ("no earnings to withdraw yet") and the in-flight/failed states.

### 5. A creator economics dashboard
Extend `api/creators/[id].js` + `skill-analytics.js` and ship a `/creators` (or
`/dashboard/earnings`) surface: per-skill revenue, the fee taken, royalties earned, split
recipients and their shares, on-chain license count, and the withdraw action. This is where a
creator decides three.ws is worth building on. All five states; tie into D2's invoices so a
creator's earnings reconcile against the same ledger buyers are billed from.

### 6. Test the economics
Cover the money math: fee + creator net = price (buyer never over-charged); N-way split shares
sum to 100% and each recipient's atomics are exact; royalty ledger debits and settles
idempotently; payout doesn't double-pay on retry; on-chain license verification gates execution.
Fixtures use `$THREE` (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) or clearly-synthetic
placeholders — **never** a real non-`$THREE` mint or wallet.

## Definition of done

Clears 00b-the-bar.md's monetization bar ("marketplace fees actually charge, actually settle,
actually reconcile") and the trust bar (trustless where possible, no funds lost, idempotent,
honest breakdown). Inherits the global definition of done in `00-README-orchestration.md`.
Specifically: multi-party splits pay each collaborator their exact share via 0xSplits;
fee+royalty+split form one transparent settlement; the on-chain skill license is minted on
purchase and verified before execution; creators can withdraw real USDC idempotently; a creator
dashboard reconciles to D2's ledger; `npm test` green; a full purchase→split→withdraw verified
end-to-end.

## Operating rules (override defaults)

No mocks/fake data/placeholders/TODOs/stubs. **`$THREE` is the ONLY coin** — never name,
hardcode, or recommend any other token; fixtures use `$THREE` or synthetic placeholders only
(runtime user-launch mints are the sole mechanical exception per CLAUDE.md). Design tokens only.
Stage explicit paths only (never `git add -A`). Own the marketplace-economics lane
(`royalty.js`, `payout.js`, `marketplace-platform-fee.js`, the splits lib, `contracts/
skill-license/*`, `skill-license-onchain.js`, `api/creators/*`); consume D1's tier helper and
D2's ledger — don't rewrite the fee or settlement modules.

## When finished

Self-review (CLAUDE.md's five checks). Ship one improvement (e.g. a "proceeds split"
visualization on the listing, or a tx-link receipt on every payout). Append a
`data/changelog.json` entry (holder-readable, tag `feature`) since creator economics are
user-visible. Then delete this prompt file
(`prompts/production-campaign/D-monetization/D4-marketplace-economics.md`) and report what you
shipped + any seam (the split-contract resolution and the on-chain license verification
contract the skill executor depends on).
