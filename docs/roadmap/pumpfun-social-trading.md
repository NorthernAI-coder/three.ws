# Pump.fun Social Trading — Strategy, Build Plan & Prompts

> North star: **three.ws becomes the place every crypto trader uses to trade pump.fun — because the best traders (human and AI) are here, their track records are provably real, you can one-tap copy them, and everyone in the loop earns.**

Status: planning. Owner: pumpfun trading initiative. Last updated 2026-06-15.

---

## 0. The one-sentence thesis

Trading pump.fun alone is lonely, hard, and a coin-flip. We turn it into a **social game with verifiable winners and shared upside**: provable on-chain track records → a leaderboard you trust → one-tap copy-trade → the trader being copied earns a performance fee → $THREE holders earn a reflection on every fee → copiers who get good graduate into leaders. That loop is the product. Everything else is surface.

## 1. Why we win (the moat is already built)

We are NOT starting from zero. The audit found these **already shipping** in this repo:

| Capability | Where it lives | What it gives us |
|---|---|---|
| Real buy/sell/launch on pump.fun | `api/pump/[action].js` (buy-prep/confirm, sell, launch, quote) | The trade rail. User-signed AND custodial (agent-signed). |
| Autonomous strategy execution | `workers/agent-sniper/*` (scorer, executor, positions) | Agents that trade themselves, with entry/exit rules. |
| Live P&L leaderboard | `/play/arena` + `src/kol/leaderboard.js` | A working "who's winning" surface. The skeleton of the leaderboard. |
| Trade ledger | `pump_agent_trades`, `pump_agent_positions` tables | Every trade is already recorded with PnL. The raw track record. |
| Verifiable reputation | Solana attestations (`api/_lib/solana-attestations.js`), ERC-8004 | Track records that **can't be faked** — signed on-chain. |
| Agent wallets | `api/agents/solana-wallet.js`, `api/_lib/agent-pumpfun.js` | Every agent holds a real Solana wallet that can trade. |
| Fee-split economy | `api/_lib/token/config.js`, `charge-three.js`, split policies | We can already split any payment N ways on-chain in $THREE. |
| Referral attribution + earnings | `api/_lib/referrals.js`, `referral-claim.js` (5% default) | Viral attribution + payout already wired. |
| Live data feeds | PumpPortal WS, Birdeye, Helius webhooks | Real-time mints, trades, graduations, prices. |
| 3D avatars reacting to trades | `/pump-live`, `src/pump/trade-reactions.js`, `<agent-3d>` | The "screenshot-worthy" differentiator nobody else has. |
| Shareable PnL/holder cards | `src/dashboard-next/pages/holders.js` (PNG export) | The viral artifact engine. |

**The gap is not capability. The gap is the loop.** These pieces don't yet connect into: *find a winner → trust the number → copy with one tap → both of you earn → brag about it → bring a friend.* Closing that loop is the whole game.

## 2. The flywheel (the only diagram that matters)

```
        ┌─────────────────────────────────────────────────────┐
        │                                                       │
        ▼                                                       │
  PROVABLE TRACK RECORD ──► LEADERBOARD YOU TRUST ──► ONE-TAP COPY
  (on-chain, can't fake)     (rank by real PnL,        (mirror their
                              not vanity)               trades live)
        ▲                                                       │
        │                                                       ▼
   COPIER GETS GOOD,                                    EVERYONE EARNS
   GRADUATES TO LEADER ◄──── SHARES THE WIN ◄──── • leader: perf fee
   (new supply of talent)    (PnL card, referral)   • platform: treasury
        │                                            • $THREE holders: reflection
        │                                            • referrer: 5%
        └────────────────────── brings friends ──────────────┘
```

Each arrow is a feature. Each node is a surface. Ship them in dependency order (Section 6).

## 3. The flagship: Copy Trading

### 3.1 Product shape

Three tiers of "follow," increasing in commitment and in how much the leader earns:

1. **Watch** (free) — follow a trader; get a live feed + push notification every time they trade. No money moves. This is the top-of-funnel and the social graph.
2. **Copy** (non-custodial, opt-in per trade or auto) — when the leader buys, *your* wallet gets a pre-built buy tx for the same coin, sized to your configured allocation (fixed SOL, % of wallet, or proportional). You sign (or pre-authorize a session key with a spend cap). Leader earns a **performance fee on your realized profit only** (high-water mark, no fee on losses). Default 10%, leader-tunable up to a cap.
3. **Vault** (managed) — deposit SOL into a leader's on-chain vault PDA; they trade the pooled book; profits split per the vault's published terms (e.g. 80% depositors / 15% leader / 5% platform). This is the "AI hedge fund" surface — highest trust, highest LTV.

> Non-custodial copy (tier 2) is the wedge: lowest trust barrier, no "they hold my money" objection, still pays the leader. Ship it first. Vaults come after trust is established.

### 3.2 Fee economics (reuse the existing $THREE rails verbatim)

Define a new split policy in `api/_lib/token/config.js`, mirroring the existing `marketplace_sale` pattern:

```
POLICY 'copy_performance_fee':
  leader:    8000 bps  (80% of the performance fee → the trader being copied)
  treasury:  1000 bps  (10% → platform, funds $THREE buybacks)
  rewards:    500 bps  (5%  → reflected pro-rata to all $THREE holders)
  referrer:   500 bps  (5%  → whoever referred the copier; existing referral rail)
```

- Performance fee is charged **only on realized profit**, gated by a **high-water mark** per (copier, leader) pair so a leader can't double-dip on the same gains.
- Settlement uses the existing `issueQuote()` → `verifyOnChain()` → `settlePayment()` flow. Charged in $THREE (holder discount applies via `holderDiscountBps`). The *trades themselves* are SOL/coin on pump.fun; the *fee* is $THREE. This keeps $THREE as the only coin the platform promotes while trades use arbitrary runtime mints (allowed under the CLAUDE.md runtime-data exception).
- Vault profit splits use the same split-policy machinery but settle continuously on withdrawal.

### 3.3 Track record: the thing that makes copy-trading trustworthy

A leaderboard is worthless if the numbers can be gamed. Our edge is **provable** stats. Compute a `TraderScore` from `pump_agent_trades` + `pump_agent_positions`, and **attest the rollup on-chain** via Solana attestations so the score is independently verifiable:

- **Realized PnL** (SOL + USD), 7d / 30d / all-time.
- **Win rate**, **avg hold time**, **max drawdown**, **Sharpe-ish consistency**.
- **Realness flags**: % of volume that's self-trades (penalize wash), unique coins traded, copier count, AUM being copied.
- **Survivorship-honest**: show the closed losers too. A leader who hides losses is a red flag we surface, not hide.

Publish a **"Proof" tab** on every trader profile: every claimed number links to the on-chain txs that produced it. This is the trust unlock and the thing competitors (Telegram bots, screenshots) can't match.

## 4. Outside-the-box ideas (the creative menu — pick & sequence)

Grouped by what job they do in the flywheel. Not all ship; this is the idea bank.

### 4.1 Make track records irresistible & viral
- **PnL Card v2** — auto-generated, screenshot-perfect card after every closed position and every day's session ("+340% • copied 3 leaders • beat 92% of traders today"). One-tap share to X/Telegram with a referral link baked in. We already have PNG export for holder cards — extend it.
- **The Replay** — turn any trade into a 6-second animated 3D clip: the agent avatar reacts, the bonding curve fills, the number pops. Shareable video. Nobody in crypto has 3D-native shareables. This is the screenshot-that-spreads.
- **"Wrapped" for traders** — weekly/monthly recap, Spotify-Wrapped style, of your best calls, your copiers, your earnings. Drops every Sunday → recurring re-engagement loop.
- **Live trade streaming** — extend `/pump-live`: top traders become "streamers." Their avatar narrates trades in real time (voice clone already exists). Viewers one-tap copy mid-stream. Twitch-for-pumpfun.

### 4.2 Make copying effortless (the "easy" pillar)
- **One-tap copy from anywhere** — every trade card, feed item, leaderboard row, and stream has a single "Copy" button. Session-key pre-authorization (spend cap, expiry) so copying after the first setup is literally one tap, no wallet popup per trade.
- **Telegram trading bot** — `/copy @leader 0.5sol`, signal alerts, PnL cards, all in TG where crypto already lives. This is the user-acquisition channel; the web app is the home base. (Note: `PUMPFUN_BOT_URL` infra exists but is consumer-only today — this is net-new.)
- **Mobile-first PWA** — the entire copy flow must work thumb-only at 320px. Crypto trading is a phone activity.
- **Smart sizing** — "copy at 1/10th their size," "cap any single ape at 0.2 SOL," "only copy buys above $20k mcap." Risk controls that let a small wallet safely follow a degen.

### 4.3 Make it a competition (the "fun" pillar)
- **Sniper Arena → Tournaments** — `/play/arena` already ranks live P&L. Layer in seasons: weekly tournaments, $THREE entry fee → prize pool, on-chain-verified results, trophies that mint as cosmetics. Leaderboard resets create recurring urgency.
- **Agent-vs-Agent fantasy** — back an AI agent like fantasy sports. Stake $THREE on which agent wins the week; winners split the pool. Turns spectators into stakeholders.
- **Draft your roster** — follow a *portfolio* of 5 leaders; your blended P&L competes on a meta-leaderboard. Encourages diversification + multiplies the number of leaders earning.
- **Coin Communities tie-in** — `/play` already has per-coin 3D worlds. Winning trades in a coin boost your standing in that coin's world. Trading ↔ social presence flywheel.

### 4.4 Make leaders want to be here (supply side)
- **Creator/leader fees that actually pay** — the 80% performance-fee leg. A good trader earns more by being copied here than trading alone. That's the recruiting pitch.
- **Leader storefronts** — each top trader gets a branded profile (`/u/:handle`), their own coin-launch history, their copiers, their vault. A reputation asset they'll promote *for* us.
- **"Proven track record" verification badge** — gated on real, attested metrics (min closed trades, min realized PnL, min unique coins, low wash %). A status symbol traders chase → they grind on-platform to earn it.
- **Recruit existing KOLs** — `api/kol/*` already proxies Birdeye wallet PnL. Import a known wallet's real on-chain history → instant pre-seeded leaderboard of recognizable names → "claim your profile" growth hack.

### 4.5 Make AI agents first-class traders (our true differentiator)
- **Strategy Lab** — visual builder for agent trading strategies (entry/exit rules, the `pump_agent_strategies` schema already exists). Non-coders create autonomous traders. Backtest against `strategy-backtest`. Then *publish* the strategy for others to copy → strategies become a marketplace.
- **Natural-language strategies** — "buy any coin a wallet I trust apes >2 SOL into, sell at 2x or -30%." LLM compiles NL → strategy JSON → armed agent. This is the magic-moment demo.
- **Agent track records are copy-able too** — an AI agent with a great record is a leader like any human. Users copy *bots*. Bots earn fees for their owner. Owner monetizes their avatar's skill. This is the "monetize your agent/avatar with a proven track record" the user asked for, made concrete.
- **Agent battle replays narrated by the agent** — the 3D + voice + on-chain combo no competitor can touch.

### 4.6 Network & trust mechanics
- **Social graph** — follows, copiers, "traders you follow also copy X." Recommendation engine on real PnL, not influencer noise.
- **Reputation staking** — leaders stake $THREE on their own track record (ERC-8004 reputation-staking pattern already in contracts). Skin in the game; slashable on proven wash-trading. Copiers trust staked leaders more.
- **Anti-rug / safety rails** — auto-flag honeypots, dev-dump risk, low liquidity before a copy executes. "We blocked this copy because the coin's dev holds 40%." Safety as a feature that builds trust.

## 5. The single most important thing to ship first

**A trustworthy leaderboard + one profile with a Proof tab + non-custodial one-tap copy of ONE leader, end to end, with a real fee settling in $THREE.**

If a user can: open `/leaderboard` → see a trader ranked by *provable* 30d PnL → open their profile → verify the numbers link to real txs → tap "Copy" → set a 0.2 SOL allocation → and have the next trade mirror to their wallet while the leader earns a $THREE fee — **the flywheel is closed and everything else is expansion.** Don't build vaults, tournaments, or the TG bot until that core loop converts.

## 6. Build plan (phased, dependency-ordered)

### Phase 0 — Track-record truth layer (foundation; nothing works without it)
- Compute `TraderScore` from `pump_agent_trades` + `pump_agent_positions`: realized/unrealized PnL (7d/30d/all), win rate, max drawdown, avg hold, unique coins, wash-% estimate, copier count, AUM-copied.
- New endpoint `GET /api/pump/trader/:wallet/stats` (and `/leaderboard`) returning ranked, paginated, cacheable scores.
- Attest daily rollups on-chain via existing Solana attestation writer so scores are verifiable.
- **DoD:** numbers match a hand-computed sample; every stat traces to txs; cache + empty/zero-trade states handled.

### Phase 1 — Leaderboard + Trader Profile + Proof tab
- `/leaderboard` page: rank by PnL/score, filters (timeframe, min trades, AI-vs-human, low-wash-only), live updates. Reuse `src/kol/leaderboard.js` patterns + `tokens.css`.
- `/trader/:handle` (or extend `/u/:address`): hero with avatar (`<agent-3d>`), headline stats, equity curve, open positions, closed-trade history, **Proof tab** (every number → tx links), copier count + AUM.
- Shareable PnL card export (extend holder-card PNG engine) with referral link.
- **DoD:** reachable from nav; empty/loading/error states; mobile 320px; screenshot-worthy.

### Phase 2 — Non-custodial copy engine (the wedge)
- Follow/copy data model: `copy_subscriptions` (copier, leader, allocation rule, risk caps, status, high-water mark).
- Copy executor: on leader trade (from the existing feed/positions pipeline), compute copier's sized order, build buy-prep tx, deliver via push + one-tap sign; optional session-key pre-auth with spend cap/expiry for true one-tap.
- Risk controls: fixed-SOL / %-wallet / proportional sizing; per-trade cap; mcap floor; honeypot/dev-dump pre-check.
- **DoD:** real mirrored trade lands on devnet then mainnet-small; caps enforced; leader can't copy into a flagged rug.

### Phase 3 — Performance fee settlement
- `copy_performance_fee` split policy in `token/config.js`.
- High-water-mark accounting per (copier, leader); charge **only on realized profit**; settle in $THREE via `charge-three.js`.
- Leader earnings ledger + dashboard surface (reuse `creatorEarnings()` / `agent_revenue_events`).
- Referrer 5% leg auto-credited (existing rail).
- **DoD:** fee charged only on profit; HWM prevents double-charge; on-chain split verified; leader sees earnings; $THREE holders see reflection.

### Phase 4 — Social loop & growth
- Live trade feed (follow graph), notifications, "traders you follow also copy X."
- PnL card auto-prompt after wins; "Wrapped" weekly recap cron.
- Verification badge gated on attested metrics.
- KOL pre-seed: import real wallet histories via `api/kol/*` → "claim your profile."
- **DoD:** a copier can go from win → shared card → friend signs up via referral, fully wired.

### Phase 5 — Expansion (sequence by traction)
- Vaults (managed, pooled SOL, on-chain PDA, profit split).
- Tournaments/seasons on `/play/arena` with $THREE entry + prize pools + cosmetic trophies.
- Telegram trading bot (acquisition channel).
- Strategy Lab + NL-to-strategy (AI-agent leaders as copy-able supply).
- Agent-vs-Agent fantasy staking.

### Cross-cutting (every phase)
- Changelog entry per user-visible change (`data/changelog.json`).
- Devnet smoke before mainnet (`scripts/pump-devnet-smoke.mjs` pattern).
- No mocks/placeholders; every state designed; mobile-first; $THREE is the only coin promoted.

## 7. Ready-to-run build prompts

Paste these to focused agents, one phase at a time, in order. Each is self-contained and assumes the operating rules in CLAUDE.md.

### Prompt A — Phase 0: Track-record truth layer
```
Build the trader track-record stats layer for three.ws pump.fun social trading.

Source of truth: the pump_agent_trades and pump_agent_positions tables (see api/_lib/schema.sql
and api/_lib/pump-quote.js for how quote_amount atomics map to SOL/USDC). Read api/pump/[action].js
(handlePortfolio, strategy handlers) and workers/agent-sniper/positions.js first to reuse PnL math —
do NOT reinvent it.

Deliver:
1. api/_lib/trader-stats.js — pure functions computing, for a given wallet/agent:
   realized & unrealized PnL (SOL + USD) over 7d/30d/all-time, win rate, max drawdown, avg hold time,
   unique coins traded, a wash-trade % estimate (self-trades / round-trips on same mint), copier count,
   and AUM currently being copied. Survivorship-honest: include closed losers.
2. GET /api/pump/trader/[wallet]/stats and GET /api/pump/leaderboard (ranked, paginated, filters:
   timeframe, min closed trades, ai-vs-human, low-wash-only). Cache ~30s like api/pump/trending.js.
3. Wire the daily rollup into the existing Solana attestation writer (api/_lib/solana-attestations.js)
   so each trader's score is attested on-chain and independently verifiable. Use a new attestation
   kind 'threews.tradescore.v1'.

Real data only. Handle zero-trade wallets, brand-new wallets, and RPC failure at the boundary.
Add a focused test that asserts stats against a hand-computed fixture of trades.
Changelog entry under 'feature'. Run npm test + npm run typecheck before reporting done.
```

### Prompt B — Phase 1: Leaderboard + Trader Profile + Proof tab
```
Build the public leaderboard and trader profile for three.ws pump.fun social trading, on top of the
Phase 0 stats endpoints (GET /api/pump/leaderboard, /api/pump/trader/:wallet/stats).

Study src/kol/leaderboard.js, src/launches.js, src/pump/coin-status-card.js, and public/tokens.css
to match existing patterns and the design system (phi spacing, glass-on-near-black, <agent-3d>).

Deliver:
1. /leaderboard page (pages/ + src/): traders ranked by 30d PnL/score, live-updating, with filters
   (timeframe, min trades, AI vs human, low-wash-only) and a one-tap "Copy" CTA per row (stubbed to a
   modal until Phase 2). Use the bonding-curve/coin-card visual language.
2. /trader/:handle profile (extend the /u/:address pattern in src/erc8004/user-profile.js if it fits):
   3D avatar hero, headline stats, equity curve (SVG, no heavy deps — see bonding-curve-chart.js),
   open positions, closed-trade history (winners AND losers), copier count + AUM, and a PROOF TAB where
   every headline number links to the on-chain tx(s) that produced it.
3. A shareable PnL card: extend the PNG export in src/dashboard-next/pages/holders.js. Card embeds the
   trader's referral link.
Add to public/nav-data.js (single source of truth — do not hand-edit menu markup elsewhere).
Every state designed (empty/loading/error/overflow), mobile 320px, hover/active/focus on all controls.
Run dev server, exercise in browser, no console errors. Changelog entry. npm test + typecheck.
```

### Prompt C — Phase 2: Non-custodial copy engine
```
Build the non-custodial copy-trading engine for three.ws. When a leader trades pump.fun, mirror a
sized order to each copier's own wallet (they sign, or pre-authorize a session key with a spend cap).
NEVER take custody of copier funds in this phase.

Reuse: api/pump/[action].js buy-prep/sell-prep, api/_lib/pump-trade-args.js, the leader-trade signal
from workers/agent-sniper/positions.js + the PumpPortal feed (api/_lib/pumpfun-ws-feed.js), and
api/_lib/agent-pumpfun.js for wallet resolution. Read these before writing.

Deliver:
1. Migration: copy_subscriptions (copier_user_id, leader_wallet, sizing_rule {fixed_sol|pct_wallet|
   proportional}, per_trade_cap_sol, mcap_floor_usd, status, high_water_mark, created_at) +
   copy_executions ledger.
2. A copy executor (worker or hooked into agent-sniper) that, on a leader buy/sell, computes each active
   copier's sized order, runs safety pre-checks (honeypot / dev-holding / liquidity — flag & SKIP unsafe
   copies, logging why), builds the prep tx, and delivers via push + a one-tap sign surface. Support
   optional session-key pre-authorization for true one-tap repeat copies.
3. Copy setup UI on the trader profile + a /dashboard copy-management page (active copies, allocation,
   caps, pause/stop, per-copy PnL).
Devnet-smoke a real mirrored trade first (extend scripts/pump-devnet-smoke.mjs), then mainnet-small.
Enforce every cap. No mocks. Changelog. npm test + typecheck. Report devnet evidence explicitly.
```

### Prompt D — Phase 3: Performance-fee settlement
```
Add performance-fee settlement to three.ws copy trading. Leaders earn a fee ONLY on a copier's realized
profit, with a high-water mark so the same gains are never charged twice.

Reuse the $THREE rails exactly: api/_lib/token/config.js (split policies), api/_lib/pricing/charge-three.js,
api/_lib/token/quote.js + payments.js (issueQuote/verifyOnChain/settlePayment), and the referral leg in
api/_lib/purchase-confirm.js. Read api/_lib/three-tier.js for holder discounts.

Deliver:
1. New split policy 'copy_performance_fee' in token/config.js: leader 8000 / treasury 1000 / rewards 500 /
   referrer 500 bps (must sum to 10000). Follow the marketplace_sale pattern.
2. HWM accounting per (copier, leader): on a profitable close, charge the configured perf-fee % (leader-set,
   capped) on realized profit above the high-water mark; settle in $THREE via charge-three.js with holder
   discount applied. No fee on losses. Record in token_payments + agent_revenue_events.
3. Leader earnings surface (reuse creatorEarnings()) on the trader dashboard; copier sees fees paid per copy.
4. Auto-credit the referrer's 5% leg via the existing referral rail.
Replay-protected (UNIQUE nonce + tx_signature already enforced). Verify the on-chain split end to end on
devnet. No fee charged on a losing or break-even close — assert this in a test. Changelog. npm test + typecheck.
```

### Prompt E — Phase 4: Social loop & growth
```
Wire the social/growth loop for three.ws copy trading so wins spread and bring new users.

Build on Phases 0-3. Reuse api/_lib/referrals.js (capture/claim/earnings), the notification system,
and the PnL card from Phase 1.

Deliver:
1. A live trade feed scoped to the follow graph (follows, copiers) + "traders you follow also copy X"
   recommendations computed from real copy data — not influencer noise.
2. Push/notification on followed-trader trades and on your own profitable closes, with a one-tap
   "share PnL card" (referral link embedded).
3. A weekly "Trader Wrapped" recap (cron, like api/cron/rewards-distribute.js): best calls, copiers
   gained, $THREE earned — delivered in-app + optional Telegram.
4. A 'proven track record' verification badge gated on attested metrics (min closed trades, min realized
   PnL, min unique coins, wash% below threshold). Show it on profiles + leaderboard.
5. KOL pre-seed: use api/kol/[action].js Birdeye proxy to import real on-chain histories for a curated
   set of known wallets → render them as unclaimed leaderboard profiles with a "claim this profile" flow.
Every surface mobile-first, every state designed. Changelog per visible change. npm test + typecheck.
```

> Phase 5 prompts (vaults, tournaments, Telegram bot, Strategy Lab, NL-to-strategy, agent fantasy) — author once Phase 0-4 is converting. Each follows the same template: name the reusable files, demand real data + devnet proof + designed states + changelog + tests.

## 8. The trading-agent "brain" prompts (for the AI traders themselves)

These are the system prompts that make an *AI agent* a good, copy-able pump.fun trader. They run inside the agent-sniper / strategy execution path, not the build pipeline.

### Base trader-agent system prompt
```
You are a pump.fun trading agent on three.ws with a real Solana wallet and a public, on-chain track
record that other users can copy. Your reputation is your product: every trade you make is recorded,
scored, and attested on-chain. You cannot hide losses, so do not chase them.

Mandate: grow realized PnL with disciplined risk, not lucky degens. Your edge is process.

Hard rules:
- Position sizing: never risk more than {RISK_PCT}% of wallet on one coin. Respect the per-trade cap.
- Entry: only enter coins meeting the armed strategy's filters (mcap band, liquidity floor, holder
  distribution, dev-holding ceiling, volume/velocity). Skip honeypots and dev-heavy supply — flag why.
- Exit: predefine take-profit and stop-loss BEFORE entry. Honor them mechanically. No "it'll come back."
- Never wash-trade or self-trade to inflate stats — it is detected, penalized, and slashes your badge.
- Narrate each decision in one plain sentence (for the live feed + your copiers): what, why, risk.

You earn performance fees from copiers ONLY when they profit. Align with them: protect downside first.
```

### Natural-language → strategy compiler prompt
```
Convert the user's plain-English trading idea into a validated pump.fun strategy JSON matching the
pump_agent_strategies schema (entry filters, sizing, take-profit, stop-loss, exit rules). Reject or
ask once if the idea has no risk control (no stop, no cap) — never arm an unbounded strategy. Validate
with the strategy-validate endpoint before returning. Output only the strategy JSON plus a one-line
plain-English summary the user can confirm.
```

## 9. Risks, guardrails, and the lines we don't cross

- **$THREE is the only coin we promote.** Trades use arbitrary runtime mints (allowed: runtime-data plumbing + platform launch records). Fees, passes, staking, prize pools are **$THREE only**. Never hardcode/recommend a specific non-$THREE mint in code, copy, or UI.
- **Non-custodial first.** Don't ship vaults (custody) until the wedge proves trust. Reduces both regulatory surface and the "they took my money" objection.
- **No fake track records.** Wash-trade detection + on-chain attestation are not optional — they are the product's credibility. Penalize, surface, and badge-slash gaming.
- **Safety pre-checks before every copy.** Honeypot / dev-dump / liquidity screen. Blocking a bad copy and telling the user why is a trust feature, not friction.
- **Fees only on realized profit, high-water-marked.** No fee on losses. This is the difference between a product traders love and a fee-extraction scheme they flee.
- **Financial-risk honesty.** Every copy surface states plainly that copying is risky and past performance isn't a guarantee. Designed, not buried.
- **Concurrent-agent worktree hygiene.** Stage explicit paths, re-check git before commit (other agents share `main`).

## 10. Why this becomes the thing everyone uses

Telegram-bot copy-trading exists, but it's: unverifiable screenshots, custodial risk, no social graph, no shareables, no AI-agent supply, ugly. We counter every one:

- **Verifiable** (on-chain attested track records) → trust.
- **Non-custodial** (your keys, one-tap) → adoption.
- **3D-native shareables** (replays, PnL cards, avatar streamers) → virality nobody can copy.
- **Everyone earns** (leaders, copiers-who-graduate, $THREE holders, referrers) → retention + word of mouth.
- **AI agents as leaders** (infinite, improvable, ownable supply of copy-able talent) → a moat that compounds.

Trading pump.fun stops being a lonely gamble and becomes a social game with provable winners and shared upside. That's the platform every crypto trader tells their friends about.
```
