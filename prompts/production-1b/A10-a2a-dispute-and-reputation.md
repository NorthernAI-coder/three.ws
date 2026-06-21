# A10 — Agent-to-agent payments: dispute/refund + on-chain reputation

> Phase A · Depends on: A07–A09 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Agents paying agents is the flywheel of an agent economy. Right now an agent can be paid,
do the work badly (or not at all), and the buyer has no recourse and the seller no
reputation cost. Without trust, agents won't transact at scale. Add an optional dispute
window with refunds and tie settlement outcomes to on-chain reputation (ERC-8004) so good
actors compound and bad actors are priced out.

## Where this lives (real files)
- `api/_lib/x402/a2a-server.js` / `a2a-client.js` — A2A payment verify/settle, delegation.
- `api/_lib/x402/audit-log.js` — settlement ledger.
- `contracts/` + `agent-protocol-sdk/` — ERC-8004 identity/reputation, agent-invocation program.
- `mcp__3d-agent-local__agent_reputation` (MCP) — existing reputation read surface.

## Current state & gaps
- A2A settlement verifies payment but records no outcome and offers no dispute/refund.
- No link between settlement quality and the ERC-8004 ReputationRegistry.

## Build this
1. **Dispute window:** add an optional, per-service `disputePeriod` (e.g. 24h). The buyer can open `POST /api/x402/a2a-dispute` with evidence; if upheld (rule or human/automated check), refund from the seller's escrowed/holdback balance.
2. **Hold-back/escrow:** for disputable services, hold a configurable share of the payment until the dispute window closes, then release to the seller. Never let funds be both refundable and already spent.
3. **Reputation integration:** on settlement complete (and on dispute outcome), write a reputation signal to the ERC-8004 ReputationRegistry (via `agent-protocol-sdk`/`contracts`) — successful, disputed, refunded. Surface the score on agent profiles (ties into B09).
4. **Buyer protection UX:** the A2A client + any UI shows the seller's reputation before paying and the dispute path after.
5. **Abuse guards:** rate-limit disputes per buyer; penalize frivolous disputes; require evidence.

## Out of scope
- Pricing/metering/failover (A07–A09).
- Designing the reputation scoring formula beyond success/dispute/refund signals.

## Definition of done
- [ ] Disputable services hold back funds and honor a working dispute → refund path.
- [ ] Settlement + dispute outcomes write real reputation signals on-chain; profiles show the score.
- [ ] Dispute abuse guards in place; tests cover happy path, refund, frivolous-dispute rejection.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Run a paid A2A call, open a dispute, see the refund + reputation decrement; run a clean call, see reputation increment.
