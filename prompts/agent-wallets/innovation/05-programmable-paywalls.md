# Task 05 — Programmable Paywalls: tip-to-unlock & x402 everywhere

> Read [00-README-innovation.md](./00-README-innovation.md) first. Build on the real
> x402 stack (`api/agent-wallet-bridge.js`, `api/agents/x402/[action].js`,
> `api/_lib/x402.js`, `api/_lib/x402-spec.js`, `api/_lib/x402-spending-cap.js`) and the
> viewer-signed tip flow (`src/shared/agent-tip.js`). Reuse them.

## The screenshot moment

An agent says "I'll write you the full alpha — unlock for ◎0.5 or 2 USDC" and a clean,
inline unlock appears right in the chat. You pay from your own wallet, it confirms
on-chain in seconds, the content reveals, and you get a permanent **Supporter** badge on
that agent that everyone can see. Creators monetize *any* moment — a message, a skill, an
AR experience, a download — with one line, no checkout redirect, no middleman.

## What you're inventing

A universal, inline **micropayment gate** that any agent surface can drop in: tip-to-unlock
and pay-per-use x402, settled for real on Solana, with persistent supporter status and a
creator dashboard of what's earning. The web has had "402 Payment Required" unused for 25
years — we make it a first-class, delightful, agent-native primitive.

## Build it

**The gate primitive (one shared component)**
- `src/shared/paywall-gate.js`: wraps any content/action behind a real price. Renders the
  locked state (what you get, the price in SOL/USDC, who you're paying), runs payment via
  the existing flows — **viewer-signed tip** (`agent-tip.js`) for simple unlocks, or the
  **x402** challenge/settle path for metered/server-verified access — then reveals on real
  confirmation. Designed locked/paying/unlocked/error/already-unlocked states. One gate,
  reused everywhere; do not copy-paste variants.
- Server: `api/_lib/paywall.js` issues + verifies access. For x402, emit a real 402 with
  the manifest (`api/_lib/x402.js`) and settle via the facilitator; record receipts in
  `x402_receipts`. For tip-unlocks, verify the on-chain tx (signature → recipient + amount)
  before granting. Persist grants in a new `agent_unlocks` table `{ agent_id, user_id,
  resource, tx_signature, granted_at }`. Re-entry is free for holders (check grants first).

**Wire real unlock points (not a demo — actual product surfaces)**
- Chat: an agent can mark a response/skill as paid (extend the skills/pricing model —
  `agent_skill_prices`, `…/pricing`); the gate appears inline in the chat UI.
- Premium artifacts: a gated download/AR scene/animation behind the gate.
- "Pay the agent for its service" (x402 call) surfaced from the wallet chip/affordance for
  visitors — the README's "call its x402" requirement, made real and inline.

**Supporter status (social proof, real)**
- A persistent supporter badge (from real `agent_unlocks`/tips) on the user's presence
  near that agent, a "top supporters" list on the agent profile, and supporter-only
  perks the owner can toggle. All from real payment records.

## Innovate further
- **Pay-what-you-want + unlock ladder:** tiers that unlock progressively; the agent
  thanks supporters by name in chat (truthfully, from real records).
- **Split unlocks into lineage royalties (task 02):** a paid unlock on a fork pays
  ancestors too — wire the two together if both are present.

## Guardrails
- Money moves only through audited paths (`recordCustodyEvent`; x402 caps via
  `x402-spending-cap.js`). Access is granted only on a **verified** real on-chain payment —
  never optimistic, never faked. Owners can't "unlock" their own gate to inflate stats.
  Clear refunds/expiry semantics where relevant. $THREE is the only coin promoted; USDC/SOL
  are rails.

## Definition of done
Per the README checklist. Prove live: gate a real piece of content, pay it from a visitor
wallet, watch it confirm on-chain and reveal, see the receipt in `x402_receipts`/grants and
the supporter badge appear; confirm re-entry is free. Add your improvement, summarize, then
delete this file (`prompts/agent-wallets/innovation/05-programmable-paywalls.md`).
