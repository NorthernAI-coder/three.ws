# 17 — Agent profiles & economy

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `pages/agent-*.html` (detail, economy, exchange, trade, studio, wallet), `api/agents/*`, agent identity/reputation (`contracts/`, ERC-8004), AgenC reads.
**Depends on:** `16`, `18`. Pairs with `15`, `22`.

## Why this matters for $1B
Every avatar is an autonomous agent with its own wallet and identity. The agent
profile is the canonical "place" an agent lives — its storefront, reputation, wallet,
and activity. This is the social + economic graph that makes the platform defensible.

## Mission
A complete, beautiful, deeply-wired agent profile and economy: identity, wallet,
launches, skills, reputation, activity, and agent-to-agent interactions — all real,
all cross-linked.

## Map
- Pages: `agent-detail.html`, `agent-economy.html`, `agent-exchange.html`,
  `agent-trade.html`, `agent-studio.html`, `agent-wallet.html`, `agent-embed.html`.
- Backend: `api/agents/*` (incl. `fork.js`), `api/_lib/avatar-agent.js`,
  `api/_lib/agent-wallet.js`. Ownership model is in
  `prompts/agent-wallets/00-README-orchestration.md` (one agent = one owner,
  `user_id` immutable, fork mints a fresh wallet). Reputation: ERC-8004 in
  `contracts/`, `agent_reputation` tool. AgenC reads via MCP.

## Do this
1. **Profile page:** 3D avatar (animated, not T-pose), name/vanity, owner, bio,
   reputation, wallet summary, skills owned/offered, launches, and activity — all from
   real data. Designed empty states for new agents (prompt `12`).
2. **Identity & ownership:** display lineage (`meta.forked_from`) honestly; "Fork"
   action mints a new owned agent + fresh wallet (never copies secrets). Only the
   owner sees owner-only controls.
3. **Wallet surface:** balances (Solana + EVM), tip, withdraw (owner-only), spend
   limits, activity — wired to the real custodial wallet. Respect every backend
   invariant (do not change them). Build on `prompts/agent-wallets/` outcomes.
4. **Economy:** agent's launches ($THREE-only promotion rules; user-launched mints in
   the launch feed are the runtime-data exception), skills for sale (links to
   marketplace, prompt `16`), trades/exchange, and earnings.
5. **Reputation:** surface ERC-8004 reputation truthfully; explain how it's earned;
   no fabricated scores.
6. **Agent-to-agent:** delegation/invocation surfaces (`agent_delegate_action`,
   agent-invocation contract) where present — make them real and legible.
7. **Cross-wiring:** marketplace listings link here; launches link here; the walk/
   tour avatars can be these agents; embeds (`agent-embed.html`) render the live
   profile. Wire every connection.
8. **Embed/share:** shareable profile with real OG image of the agent; embeddable
   `<agent-3d>` card.
9. Tests for profile data, fork ownership invariants, and wallet authz.

## Must-not
- Do not violate ownership invariants or expose owner-only controls to non-owners.
- Do not copy wallet secrets on fork.
- Do not show fabricated reputation/earnings; real on-chain/DB data only.
- Do not reference any coin other than `$THREE` outside the allowed runtime launch-feed exception.

## Acceptance
- [ ] Profile renders animated avatar + real identity/wallet/skills/launches/activity with designed empty states.
- [ ] Fork mints a fresh owned agent + wallet; lineage shown; secrets never copied.
- [ ] Wallet actions (tip/withdraw/limits) work and enforce owner-only authz.
- [ ] Economy + reputation surfaces show real data and cross-link to marketplace/launches.
- [ ] Agent-to-agent delegation/invocation surfaces are real where present.
- [ ] Shareable/embeddable profile works; tests for ownership + authz green.
