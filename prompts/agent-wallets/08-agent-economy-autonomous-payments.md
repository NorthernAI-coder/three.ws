# Task 08 — The Agent Economy (autonomous agent-to-agent payments)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, design tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Builds on the shared wallet component
> (**task 01**), the HUD (**task 02**), and the spend policy used in task 05.

## Mission

Make every agent wallet a **participant in a real economy**, not just a vault. Agents
on three.ws can already pay for things over x402 and can be paid for skills. This task
makes that first-class and visible: **your avatar has a job.** It earns when others
use its skills; it autonomously pays other agents for services it needs; its owner
sets the policy and watches the balance grow while they sleep. The headline feeling:
"I made a 3D avatar and it's out there earning money for me."

No part of this may be simulated. Every payment is a real x402 settlement or a real
on-chain/USDC transfer through the existing rails, bounded by the existing spend
policy.

## What exists (read it before building)

- **x402 payment bridge:** [api/agent-wallet-bridge.js](../../api/agent-wallet-bridge.js)
  — fetches a real 402 challenge from an endpoint, validates the Solana exact-scheme
  USDC support, checks spending caps, signs + submits a real `TransferChecked`, and
  audit-logs the settlement. Has per-payment and per-day caps. `status` / `quote` are
  public reads; `pay` requires auth.
- **Skill monetization (earning side):**
  [api/_lib/services/MonetizationService.js](../../api/_lib/services/MonetizationService.js)
  + `api/agents/[id]/skills-pricing.js` — an owner prices their agent's skills;
  `assertOwnership` gates edits. This is how an agent *charges*. Wire the buyer side
  to real payment so a skill purchase actually settles.
- **Spend policy / guards:** [api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js)
  + `GET/PUT /api/agents/:id/solana/limits` — daily USD cap, per-tx ceiling,
  allowlist, kill switch. **Every autonomous payment must pass `enforceSpendLimit`.**
- **Ledger:** `agent_custody_events` records every real payment (category `x402`
  etc.) — your earnings/spending history source.

If you need an endpoint (e.g. "list services my agent can hire", a real earnings
summary, a job queue), **build it for real**: owner auth, CSRF on writes, spend-limit
enforcement, real settlement, audit log. Never fake an earning or a payment.

## What the Agent Economy surface must do

A coherent owner surface (in the HUD as an "Earn / Pay" section, plus a discovery
view), all real:

1. **Earnings** — the agent's real income: skill purchases, tips, payments received,
   with real totals (today / 7d / lifetime) from the real ledger. "Your avatar earned
   $X this week" — every dollar traceable to a real settlement. Charts from real data
   only.
2. **Skill pricing (the earning engine)** — let the owner price the agent's skills
   ([MonetizationService](../../api/_lib/services/MonetizationService.js)) and make the
   buy side **actually settle** over x402/USDC so a purchase moves real funds into the
   agent's wallet. Close the loop end-to-end; do not leave "pricing" as a number with
   no payment behind it.
3. **Autonomous spending (bounded)** — the owner grants the agent a real allowance and
   policy ("may spend up to $X/day on services from this allowlist") and the agent
   pays other agents/endpoints over the real x402 bridge within `enforceSpendLimit`.
   Surface exactly what it spent, on what, with the real signature. Kill switch and
   allowlist are prominent — autonomous spend without an instant off-switch is
   unacceptable.
4. **A real services directory** — agents that offer paid skills are discoverable;
   one agent can **hire** another (real payment, real invocation). This is the
   network effect: agents transacting with agents. Use the on-chain agent-invocation
   / skill-license primitives where they exist
   ([contracts/agent-invocation/](../../contracts/agent-invocation),
   [contracts/skill-license/](../../contracts/skill-license)) so a purchase yields a
   real, verifiable access grant — not a DB boolean alone.
5. **Receipts** — every payment in/out has a real receipt: amount, counterparty,
   skill/service, signature, time. Frame the ledger as a clean statement, not a debug
   dump.

## Ownership & safety (defense in depth)

- Only the owner sets pricing, grants allowances, or arms autonomous spend. These
  controls are absent from the DOM for non-owners and rejected server-side.
- Visitors can **buy** a skill / **hire** the agent (that's the demand side) and tip,
  but never configure it.
- Autonomous payments are hard-bounded by the real spend policy + allowlist + caps in
  `agent-wallet-bridge.js` / `agent-trade-guards.js`. Never widen those limits
  silently; the user sees and controls every ceiling.

## $THREE rule

USDC is the settlement asset for x402 (runtime plumbing — allowed). **$THREE is the
only coin the platform names or promotes.** Never hardcode or recommend any other
token as a service price, payout, or example. Counterparty mints/services come from
real runtime data, rendered generically.

## Innovation mandate

- **"Your avatar has a job"** — make the earning narrative the emotional core. A real
  "earned while you were away" moment when the owner returns. Real numbers, real pride.
- **Agent-to-agent as a visible network** — a small, real graph of who-paid-whom
  (from the ledger) turns the economy into something explorable and viral. Coordinate
  with the Money Pulse (task 07).
- **Set-and-forget trust** — the spend policy + kill switch is what makes letting an
  agent transact autonomously *feel safe*. Present it as the feature that makes the
  magic responsible, not as buried settings.
- Invent past this where it raises the bar — but no simulated income, payment, or
  counterparty, ever.

## States & edge cases

No earnings yet (warm "price a skill to start earning" empty state); a payment that
fails the 402 challenge or exceeds caps (actionable, funds untouched); insufficient
USDC for an autonomous payment; allowlist rejection; expired session mid-pay;
counterparty endpoint down; a skill priced but never bought; double-submit /
idempotency on settlement; 0 / 1 / many receipts; very long service names;
320/768/1440.

## Definition of done

Per the orchestration README. Plus: a real skill purchase settles end-to-end over the
real x402/USDC rails and moves real funds into the agent's wallet; an autonomous
payment fires through the bridge and is **provably** bounded by `enforceSpendLimit` +
allowlist + kill switch; earnings/receipts trace to real `agent_custody_events`;
owner-only config enforced in UI and server; the services directory lists real paid
skills; no console errors; responsive. No non-$THREE coin named or promoted.

When done: self-review + improvement pass, real changelog entry,
`npm run build:pages`, commit (explicit paths only; both remotes if asked), then
**delete this file**
(`prompts/agent-wallets/08-agent-economy-autonomous-payments.md`).
