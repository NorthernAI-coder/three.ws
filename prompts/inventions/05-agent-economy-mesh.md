# Invention 05 — The Agent Economy Mesh (agents that pay each other, visibly)

> **Read [00-README-inventions.md](./00-README-inventions.md) first** for the unique
> stack, ownership model, real resources, hard rules, definition of done, and the
> "improve then delete this file" close-out.

## The invention

We have the pieces for something no one else has: agents with wallets, identities,
skills, and an x402/skill-license payment protocol. Build the **Agent Economy
Mesh**: a real, visible, living economy where agents **autonomously pay each other**
for skills, signals, and services — and where owners can watch and monetize their
agent's place in that economy.

A wallet that earns *while you sleep* because other agents pay yours for a skill it
offers — settled on-chain, within limits, fully audited — is a genuinely new primitive.

## What to build (on the real rails — no simulation)

1. **Skill/service marketplace between agents** — an agent can offer a real,
   priced capability (a signal, a data feed, a generation, an action) that other
   agents consume and **pay for on-chain** via the existing x402 / skill-license /
   agent-payments rails ([agent-payments-sdk/](../../agent-payments-sdk),
   [mcp-server/](../../mcp-server), skill-license contracts). Real settlement, real
   `agent_payments` rows.
2. **Autonomous, limit-bound spending** — when an agent calls another agent's paid
   skill, the payment flows from its custodial wallet **within its spend policy**
   (`api/_lib/agent-trade-guards.js`), audited in the custody trail. This already
   exists in part (`triggerSkillPayment`) — extend it into a first-class, visible
   economy. Never bypass the per-tx/daily limits, especially for autonomous calls.
3. **Earnings for owners** — an owner sees their agent's **real** earned revenue
   (who paid, for what, when, tx links), withdrawable to them. The wallet becomes a
   yield-bearing asset tied to a character that does real work.
4. **A live economy surface** — a real-time visualization of value flowing between
   agents (who's paying whom, top earners, busiest skills) built from **real**
   payment events. Wire it to the theater (`01`) where flows can animate between
   avatars. Plus a per-agent "economy" tab: revenue, expenses, net, top customers.
5. **Discovery** — agents/owners can find paid skills to consume or competitors to
   undercut, ranked by **real** usage and reputation (`02`).

## $THREE & safety guardrails

- Payments settle in real runtime assets (USDC/SOL and runtime mints). **Never name,
  hardcode, or recommend any non-$THREE coin.** $THREE is the only coin the platform
  features.
- Autonomous spend is always policy-bound, owner-consented (the owner enables which
  paid skills their agent may consume and the budget), and fully audited. An agent
  can never be drained by another agent — limits and allowlists are law.
- Idempotency on payment/settlement (reuse the existing idempotency-key pattern) so a
  retry never double-charges. Re-derive from chain/DB before claiming settlement.

## Innovation mandate

- **Agents hiring agents** — an agent can commission another agent's skill as part of
  its own workflow (e.g. a trading agent paying a signals agent), all on-chain, all
  visible. Compose real multi-agent value chains.
- **Owner as economy operator** — surface pricing/optimization insight from real
  demand so an owner can tune their agent's offerings to earn more.
- **Provenance** — every paid invocation is a real, auditable event; link to the
  on-chain record. Trust through verifiability.

## States & edge cases

No economy activity yet (designed empty state with a real "offer a skill" CTA);
payment failure / insufficient balance / over limit / frozen wallet (honest, never a
fake "paid"); a consumed skill that errors after payment (real refund/retry policy);
high-volume agent (aggregate efficiently); forked agent (separate wallet, separate
earnings, never co-mingled); session expiry. Every path designed and funds-safe.

## Definition of done

Per the inventions README. Plus: a real agent-to-agent paid skill call settles
on-chain within spend limits with an audit entry and a real `agent_payments` row;
an owner sees real earnings and can withdraw them; the live economy visualization
renders from real payment events; double-charge is impossible (idempotency proven);
`npm test` covers settlement + limit enforcement + idempotency. No console errors.
Responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/inventions/05-agent-economy-mesh.md`).
