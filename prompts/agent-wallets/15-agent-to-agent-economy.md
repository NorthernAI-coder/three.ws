# Task 15 — The Agent-to-Agent Economy (a real machine economy, embodied)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> ownership model, design tokens, real APIs, hard rules, and the safety rules for
> custodial funds. Builds on the wallet identity layer (**task 01**), the spend-policy
> engine (**task 05**), and connects to the multiplayer rooms. Invention-layer — read
> **The invention bar**.

## Why only three.ws can build this

We already have the three things a machine economy needs and that no one else has
together: agents with **real funded custodial wallets**, an **agent-to-agent payment +
skill-invocation protocol** ([api/agents/a2a-call.js](../../api/agents/a2a-call.js),
[a2a-mandate.js](../../api/agents/a2a-mandate.js),
[a2a-paid.js](../../api/agents/a2a-paid.js), the x402 rails under
[api/x402/](../../api/x402), [agent-payments-sdk/](../../agent-payments-sdk),
[agent-protocol-sdk/](../../agent-protocol-sdk)), and **3D bodies that share
multiplayer rooms** ([multiplayer/](../../multiplayer)). So we can build a real economy
where agents **autonomously hire and pay each other** for skills and services — and you
can *watch it happen* between embodied characters. Not a diagram of a future agent
economy: a live one, with real money, real receipts, and real avatars doing the work.

## Mission

Let agents discover, hire, and pay each other for real skills/services using their
custodial wallets via the real A2A + x402 rails — bounded by each agent's spend policy,
recorded as real on-chain invocation receipts, and visualized as embodied interactions
in the multiplayer rooms. Build the marketplace of agent-offered services and the live
economy view on top of real transactions only.

## What exists (read it before building — do NOT reinvent)

- **A2A + payments:** `api/agents/a2a-call.js` (one agent invokes another's skill),
  `a2a-mandate.js` (authorization/mandate), `a2a-paid.js` (the paid invocation), the
  x402 micropayment endpoints ([api/x402/](../../api/x402)),
  [agent-payments-sdk/](../../agent-payments-sdk) and
  [agent-protocol-sdk/](../../agent-protocol-sdk). These are the real rails — wire the
  economy through them; do not invent a parallel fake payment path.
- **On-chain invocation receipts:** the agent-invocation Anchor program
  ([contracts/agent-invocation/](../../contracts/agent-invocation)) records verifiable
  agent-to-agent skill invocations; on-chain skill licenses
  ([contracts/skill-license/](../../contracts/skill-license),
  [api/_lib/skill-license-onchain.js](../../api/_lib/skill-license-onchain.js)) gate
  who may offer/consume a skill.
- **Spend guards:**
  [api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js) — a paying
  agent's outlay is reserved against its real spend policy, with the kill switch. A
  hire is just another policy-gated spend.
- **Bodies + rooms:** [multiplayer/](../../multiplayer),
  [src/shared/agent-3d.js](../../src/shared/agent-3d.js),
  [src/agent-avatar.js](../../src/agent-avatar.js) for the embodied interaction; the
  wallet identity layer (task 01) for who's paying whom.

## What the agent-to-agent economy must do (every payment is real)

1. **Service offers.** An owner lets their agent **offer a skill for a price** (e.g.
   translation, art generation, analysis — whatever skills the platform supports),
   priced in the real payment unit, gated by a real skill license. Persisted as a real
   offer; discoverable.
2. **Autonomous hire + pay.** An agent that needs a skill **hires another agent**: it
   pays the provider's wallet via the real x402 / `a2a-paid` flow, the provider
   executes the real skill invocation, and a **real on-chain invocation receipt** is
   written. The payment is reserved against the hiring agent's spend policy *before* it
   sends — no policy bypass.
3. **Embodied transactions.** Surface the hire in the 3D world: in a shared multiplayer
   room, the paying agent and the provider agent visibly interact (approach, hand-off
   animation via the existing emotion/gesture layer), and the value flow registers in
   the Galaxy Money-Cam (task 12). You can *watch* agents do business.
4. **Service marketplace + reputation.** Browse agent-offered services with **real**
   completion counts, real ratings/throughput from real invocations, and real prices.
   A provider agent builds a real track record; a great service earns real income to
   its wallet. No fabricated stats.
5. **Receipts + accounting.** Both agents' wallets show the real income/outlay, linked
   to the real invocation receipt and tx. The economy is fully auditable end to end.

## Safety (non-negotiable — autonomous agents spending real funds on each other)

- **Owner-sets-the-mandate; agent acts within it.** Owners authorize what their agent
  may pay for and up to what limit (the A2A mandate + spend policy). An agent can only
  ever spend **its own** wallet, within **its own** policy, server-enforced. Hiring
  never grants access to anyone else's funds.
- **Spend policy + mandate are the ceiling.** Every hire is reserved and clamped
  server-side before payment. Kill switch halts all autonomous spending instantly.
- **Real value or no transaction.** A paid invocation only completes if the real skill
  actually executed; failed/disputed work resolves honestly (refund/retry per a defined
  rule), never a charge for nothing. No mock services, no fake receipts.
- **Idempotent + audited.** Every hire/pay/invoke is idempotent and written to the
  custody + invocation trail. No double-charge on retry.
- **$THREE rule honored.** Pricing/payment uses the existing real USDC/x402 plumbing;
  never name or promote a non-$THREE mint.

## States & edge cases (all designed, all honest)

Provider offline / skill unavailable (don't charge; route or fail cleanly); payment
succeeds but invocation fails (refund per the defined rule, audited); hiring agent over
budget / mandate (refuse with the real reason); no providers for a requested skill;
disputed/low-quality result; provider agent deleted mid-job; network failure mid-pay
(idempotent, re-check real state, never double-charge); 0 / 1 / many concurrent jobs;
very long service/agent names; a room with many simultaneous embodied transactions
(stay legible and 60fps). Each designed.

## Definition of done

Per the orchestration README's checklist. Plus: one agent autonomously hires another,
pays its wallet via the **real** x402 / `a2a-paid` rails within its spend policy +
mandate (devnet acceptable), the provider executes the real skill, and a **real**
on-chain invocation receipt is written with explorer links on both sides; the
marketplace shows real completion stats with zero fabrication; the hire is visible as an
embodied interaction in a multiplayer room and as a flow in the money-cam; a
payment-succeeds-but-work-fails case refunds honestly; owner mandate + spend-policy
ceiling + kill switch enforced server-side; idempotent and audited; no non-$THREE coin
promoted; no console errors.

When done: run the self-review + improvement pass, add a real changelog entry,
`npm run build:pages` to validate, commit (staging explicit paths only; push to
**both** `threeD` and `threews` if asked), then **delete this file**
(`prompts/agent-wallets/15-agent-to-agent-economy.md`).
