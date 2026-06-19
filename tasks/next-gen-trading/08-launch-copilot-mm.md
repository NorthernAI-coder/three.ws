# Task 08 — Launch Copilot: Autonomous Fair-Launch Market-Maker

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.
>
> **Depends on tasks 01 (firewall) and 02 (MEV engine).**

## The invention

Launching a coin today is fire-and-forget: you mint and hope. We make the launching agent
**run the book**. When a user launches through three.ws, their agent becomes an autonomous
**fair-launch market-maker**: it seeds the configured initial buy, defends a floor by buying
dips within a budget, takes measured profit into strength to recycle liquidity, manages the
bonding-curve→AMM graduation transition smoothly, and provides/withdraws liquidity post-grad per
policy — all transparently, all from the agent's own audited wallet. A launch on three.ws comes
with a built-in, rules-based, non-manipulative market-maker. Nobody offers that.

## Context (real, verified)

- Launch flow: `api/pump/[action].js#handleLaunchPrep` (~L1194), metadata + token creation
  `api/_lib/pump-launch.js` (`uploadPumpMetadata`, `launchPumpToken`), `pump_agent_mints`,
  agent-payments PDA + `buyback_bps` config already exist (`getPumpAgentOffline`).
- Trading primitives to reuse: `api/_lib/pump.js` (curve + AMM quotes, `getAmmPoolState`),
  `api/_lib/pump-swap-ix.js`, `executor.js`/`positions.js` patterns, firewall (01), MEV (02).
- Graduation handling already exists: `workers/agent-sniper/amm-exit.js` (`isGraduated`,
  `quoteAmmSell`, `buildAmmSellInstructions`) — extend to two-sided MM, not just exit.
- Spend guards + custody: `api/_lib/agent-trade-guards.js`, `agent_custody_events`.
- Launch UI: `pages/create-agent.html` success path; `/launches` feed.

## Goal

A `market_maker_policies` model + a worker loop that lets a launcher attach an autonomous,
rules-based MM to a coin launched via three.ws, executing real floor-defense / profit-recycling /
graduation-transition trades from the agent wallet, with a live control panel.

## What to build

1. **Policy model** — `market_maker_policies` (mint, network, agent_id, owner user_id, enabled,
   mode simulate|live, floor_price / floor_band, dip_buy_budget_lamports, take_profit_band,
   recycle_pct, max_inventory, graduation_action [provide_lp|hold|distribute], daily_budget,
   kill_switch). Attachable at launch (in `handleLaunchPrep`) or after, from the launch's detail
   page. Dated migration.
2. **MM engine** — a worker loop (extend `workers/agent-sniper/` or a sibling MM worker) that, per
   active policy, re-quotes the coin (curve pre-grad, AMM post-grad), and within budget: buys when
   price falls through the floor band (defend), sells measured size into spikes above the take
   band (recycle liquidity, lock realized SOL), and rebalances toward `max_inventory`. Every action
   runs through the firewall (01) and MEV engine (02), spend-guarded + audited. Bounded,
   non-reflexive sizing — never chase, never wash trade against itself.
3. **Graduation transition** — detect approach to graduation and execute the configured
   `graduation_action`: provide LP into the canonical AMM pool, hold inventory, or distribute. Use
   the existing AMM plumbing; make the curve→AMM handoff seamless (no parked inventory). Honest
   logging of each step.
4. **Anti-manipulation guardrails (explicit, non-negotiable)** — the MM defends and recycles
   within a transparent published policy; it must **not** wash-trade to fake volume, spoof, or
   paint the tape. Encode hard caps: no self-cross within N seconds, max % of volume, disclosed
   policy. This is honest liquidity provision, not manipulation — build it that way and document
   the limits in code + UI.
5. **API + UI** — `/api/launch/mm` (CRUD policy, pause, kill), `/api/launch/mm/:mint` (live state:
   inventory, realized PnL, recent MM actions, budget remaining), SSE for live actions. Build a
   **Launch Copilot** panel on the launch success screen + the coin's detail page: configure the
   policy with plain-language presets ("gentle floor defense", "aggressive recycle"), a live action
   log, inventory + realized chart, budget + kill controls. All states designed; accessible;
   responsive.

## Constraints

- Every MM trade is real, firewall-gated, spend-guarded, audited; the kill switch halts instantly
  and the owner can always withdraw remaining inventory + SOL.
- Strictly non-manipulative: no wash trading, no fake volume — codify and surface the guardrails.
  If a requested policy would cross that line, refuse to enable it with a clear explanation.
- Simulate mode runs the full logic without spending, clearly labeled, for confidence.
- $THREE-only rule. The MM operates on the user's launched coin (a runtime mint) and promotes no
  token; never reference any coin other than $THREE in copy.

## Success criteria

- A coin launched via three.ws can attach an MM policy; the worker executes real
  floor-defense/recycle trades from the agent wallet, firewall-gated + audited.
- Graduation transition runs the configured action with no parked inventory.
- Anti-manipulation caps enforced in code; kill + withdraw always work.
- Launch Copilot UI renders all states with live action log + controls.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/08-launch-copilot-mm.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
