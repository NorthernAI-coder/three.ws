# Pump.fun Trading — Product Plan & Prompt Library

**Status:** planning · **Owner:** TBD · **Last updated:** 2026-06-15 (creative-plays + cold-start expansion)

> Scope lock: this document is *only* about pump.fun trading, deploying, and the
> copy-trade / earn-when-copied economy around it. Everything else (forge,
> avatars-as-art, world, naming) is out of scope here except where it directly
> makes trading more fun or more viral.

---

## 0. TL;DR

We already have the hard parts of a pump.fun trading stack: a live sniper worker,
a strategy DSL with backtest/validate/run, a positions ledger with realized PnL +
trailing stops, on-chain reputation, SIWS auth, PumpPortal + Helius feeds, the
pump trade/launch SDKs, and $THREE pay-per-use rails.

What we do **not** have is the *product*: the thing a degen opens at 3am, the
thing they screenshot, the thing that makes the trader they copied richer so that
trader shills us for free.

The bet: **turn proven traders (human or agent) into creators who earn a cut of
the profits they generate for their followers, wrap the whole thing in a 3D
avatar personality layer nobody else has, and make every win a shareable
artifact with a referral hook baked in.**

The flywheel:

```
 great agents/traders  →  provable on-chain track record  →  followers copy them
        ↑                                                              │
        │                                                              ▼
  leaders earn perf-fees  ←  followers profit & stay  ←  copied trades execute
        ↑                                                              │
        └──────────  shareable PnL cards + referral $THREE  ◀──────────┘
```

Every loop spins the next: leaders earn → recruit followers; followers win →
share cards; cards carry referral links → new users; new users need someone to
copy → demand for leaders. $THREE is the settlement layer and the throttle.

---

## 1. Who is the user, and what are they trying to do

Three personas. Build for all three; they feed each other.

### 1.1 The Degen (the follower / the masses)
Wants to make money on pump.fun without staring at charts for 18 hours. Today
they ape into whatever's trending and get dumped on. They don't have edge.
**Our promise:** "Pick a proven agent. Set a budget. Go to sleep. Wake up to
trades you'd never have caught." One-tap copy. Hard spend caps. Their own
non-custodial wallet — we never hold funds.

### 1.2 The Alpha (the leader / the creator)
A sharp trader or a well-tuned agent that actually prints. Today their edge is
worth nothing beyond their own bag — they post screenshots for clout. **Our
promise:** "Get copied, get paid. Your track record is on-chain and unfakeable.
The more people you make money, the more you earn." Performance fees + a public
rank + a fan base.

### 1.3 The Builder (the agent author / power user)
Wants to build/tune a trading agent — a sniper, a graduation-hunter, a
contrarian. Today they'd write a Trojan/BullX config in a vacuum. **Our
promise:** "Compose a strategy, backtest it on real history, paper-trade to a
provable record, then open it for copy and earn from every follower." Strategy
DSL + backtest + marketplace.

---

## 2. Why we win (the moat nobody else has)

Competitors: Photon, BullX, Trojan, GMGN, Axiom, Bloom, Maestro, Pepeboost.
They are fast, sterile, identical Telegram/terminal UIs. Copy-trading exists
(GMGN, BullX) but it's "mirror a raw wallet" — no reasoning, no personality, no
creator economy, no provable identity.

Our five differentiators:

1. **Agents that explain themselves.** Not "wallet 0xabc bought" — *"$TICKER:
   curve 68% to graduation, 3 of last 5 buys are fresh wallets, creator has 2
   prior graduations, dev holds 4%. Entering 0.5 SOL, TP +60% / SL −25%."* Copy
   reasoning, not just trades. This is the single biggest trust unlock.
2. **3D avatar personality layer.** Your trader has a face, a voice, a vibe. It
   celebrates a 5x, sweats a drawdown, trash-talks a rival agent. We already
   drive avatars from the live feed (`pump-fun-skills/reactive`). Nobody else
   has entertainment. Entertainment is what gets shared.
3. **Earn-when-copied creator economy.** Performance fees flow to leaders.
   This makes leaders *recruit for us*. None of the terminals pay their
   alpha-providers.
4. **Provable, on-chain track record.** PnL attested on-chain
   (`solana_attestations`, reputation endpoint). Can't fake screenshots.
   "Verified +340% / 90d, skin-in-game 12 SOL" beats a Photon screenshot every
   time.
5. **$THREE-native economy.** Fees, discounts, tournament prize pools, leader
   payouts route through $THREE. Holders get fee discounts and revenue share.
   The token is the product's bloodstream, not a sidecar.

---

## 3. The product surfaces (what we actually build)

Each surface notes the existing infra it sits on so we build, not re-build.

### 3.1 The Arena — live agent trading leaderboard (the front door)
A public, real-time leaderboard of trading agents ranked by **verified** PnL,
win rate, Sharpe-ish consistency, max drawdown, and follower AUM. Filter by
timeframe (24h / 7d / 30d / all), strategy type, and risk level. Each row is a
live card: avatar, current open positions, today's PnL ticking in real time,
"Copy" button, follower count, fee rate.

- *Builds on:* `agent_sniper_positions` (PnL), `api/x402/agent-reputation.js`,
  `api/cosmetics/leaderboard.js` (computation pattern), SSE
  `api/pump/trades-stream.js`.
- *The hook:* this is the page that gets bookmarked. Make it gorgeous and live.

### 3.2 The Agent Profile — a trader's home page
Public page per agent: 3D avatar front and center, verified track record
(equity curve, all-time PnL, best/worst trades, current holdings), strategy
description in plain language, fee rate, followers, total profit generated for
followers ("has made followers +$142k"), and a one-tap **Copy** flow. Trade log
streams live with reasoning attached to each trade.

- *Builds on:* `src/agent-home-pumpfun.js`, `api/pump/portfolio.js`,
  `api/pump/dashboard.js`, agent identity system.

### 3.3 Copy-Trade — the money mechanic (detailed in §4)
One tap from any leaderboard row or profile. Pick budget, per-trade cap, daily
cap, copy filters (only buys above $X mcap, ignore positions over Y SOL).
Non-custodial: follower's own wallet via delegated session key with hard caps.

- *Builds on:* `agent-spend-policy.js`, `solana-agent-sdk` session signing,
  `workers/agent-sniper/`, `agent-payments-sdk`.

### 3.4 The Studio — build/tune your own trading agent
Pick a persona (Sniper / Swing / Graduation Hunter / Contrarian / Custom),
configure entry/exit rules via the strategy DSL, **backtest on real history**,
**paper-trade** to build a provable record, then flip to live, then open for
copy. This is how we manufacture supply of leaders.

- *Builds on:* `api/pump/strategy-backtest.js`, `strategy-validate.js`,
  `strategy-run.js`, `agent_sniper_strategies` schema, `examples/skills/
  pump-fun-strategy/`.

### 3.5 Launchpad — agents that deploy coins
An agent (or user) launches a coin with one tap, optionally with creator-fee
sharing to followers/holders, then can trade/buyback/distribute autonomously.

- *Builds on:* `pump-fun-skills/create-coin`, `api/pump/launch-*`, `coin-fees`,
  `autopilot.js`, `src/agent-skills-pumpfun-autonomous.js`. Already strong —
  mostly needs UI polish and wiring into Arena/profile.

### 3.6 The Feed — TikTok for trades (virality engine, §6)
A vertical, swipeable feed of notable trades: "$AGENT just 7x'd $TICKER",
avatar reaction clip, the reasoning, the PnL card, a Copy button, a referral
link. Public, no login needed to browse. This is the top-of-funnel.

### 3.7 Tournaments / Seasons (§6)
Recurring competitions with $THREE prize pools. Equal starting capital, fixed
window, public leaderboard, avatars battling. Fantasy-league energy.

### 3.8 Native distribution: Telegram + X bots
Meet traders where they live. A Telegram bot that posts your agent's trades and
lets you copy from chat; an X auto-poster for big wins (PnL card + link).

- *Builds on:* `api/pump/deliver-telegram.js`, alert system, PnL card renderer.

---

## 4. The money: copy-trade + earn-when-copied (designed concretely)

This is the answer to your "person being copy-traded earns a fee?" — **yes, and
it's the whole flywheel.** Here's the concrete design.

### 4.1 Custody model (non-custodial, phased)
- **Phase 1 — Delegated mirror.** Follower keeps funds in their own wallet and
  grants the copy-engine a **session key with hard caps** (max per trade, max
  daily, max total, allowlist = pump.fun program only, auto-expiry). The engine
  mirrors the leader's trades into the follower's wallet. We never custody.
  Uses `agent-spend-policy.js` + session signing already in `solana-agent-sdk`.
- **Phase 2 — Copy vault (optional, later).** An on-chain program-controlled
  vault followers deposit into; leader directs; performance fee skimmed
  on-chain at withdrawal against a high-water mark. More powerful (pooled size,
  cleaner accounting) but needs an audited program. Defer until Phase 1 proves
  demand.

### 4.2 Performance fee mechanics
- Leader sets a **performance fee** (suggested default **15%**, capped at, say,
  30%). Fee is charged **only on realized profit**, **only above a per-follower
  high-water mark** (no double-charging the same gains). This is the industry-
  correct model and it's fair — leaders eat nothing when followers lose.
- Optional small **flat copy subscription** (e.g. a few $THREE/week) as an
  anti-spam floor, waivable by holders. Default off; perf-fee-only is cleaner
  for launch.
- **Settlement:** fee computed on each profitable exit; accrued; swept
  periodically. Charged in the trade's quote asset (SOL/USDC) or auto-converted
  to $THREE. Built on `charge-three.js` two-phase CHARGE→SETTLE and
  `agent_revenue_events`.

### 4.3 The split (where each fee goes)
On a follower's realized profit above high-water mark, the performance fee
splits roughly:

| Recipient | Share | Why |
|---|---|---|
| **Leader** | 70% | The alpha. Their reason to recruit followers. |
| **Platform treasury** | 20% | Funds dev, buys back $THREE, seeds prize pools. |
| **Referrer** | 10% | Whoever brought the follower (or the leader). Viral fuel. |

(Tune later. The point is leaders earn the lion's share, the platform sustains,
and referrers are paid — every dollar of profit funds the next loop.)
Built on `api/_lib/token/config.js` split-policies + `referrals.js`.

### 4.4 Skin-in-the-game requirement (trust + anti-rug)
To be copyable, a leader must have **their own capital deployed alongside
followers**, provable on-chain, displayed on their profile ("12 SOL skin in
game"). This aligns incentives — a leader can't pump-and-dump followers without
eating it themselves. Enforced by reading the leader's own wallet positions
against the trades they broadcast. Huge trust signal; nobody else does it.

### 4.5 Guardrails (protect the follower)
- Per-trade / daily / total spend caps (hard, on-chain via session key).
- Max position concentration, min liquidity / mcap filters, max slippage,
  honeypot/sell-tax checks before mirroring a buy.
- Auto-pause copy if leader drawdown exceeds follower's set threshold.
- "Front-run protection": cap how much a follower copies relative to leader size
  so a tiny leader can't be gamed.
- One-tap "stop copying + sell all" panic button.
- *Builds on:* `pump-alert-eval.js`, `scorer.js`, `agent-spend-policy.js`.

---

## 5. Provable track record (the trust layer)

Screenshots are dead. We win on **unfakeable** records.

- Every agent trade is attested: signature, mint, entry/exit, realized PnL,
  timestamp → `pump_agent_trades` + `solana_attestations`.
- The reputation endpoint (`api/x402/agent-reputation.js`) already returns a
  paid snapshot; extend it with trading-specific metrics: verified PnL,
  win rate, profit-generated-for-followers, max drawdown, days active, skin in
  game, # graduations launched.
- Surface a **"Verified" badge** that links to the on-chain proof. A leader's
  claimed +340% is one click from the chain.
- **Anti-gaming:** rank by *risk-adjusted* and *follower-outcome* metrics, not
  raw PnL, so an agent can't farm rank with one lucky 100x on dust. Weight
  "profit actually delivered to followers" heavily — that's the metric that
  matters and the one that's hardest to fake.

---

## 6. Virality — the social effect (this is the assignment)

Distribution is the product. Bake the loop into every win.

### 6.1 The shareable PnL card (the atomic viral unit)
Auto-generate a beautiful image on every notable exit: avatar, ticker, multiple
(7.2x), entry→exit, time held, "copied by 214 traders", three.ws watermark, and
a **referral link**. One tap to post to X/Telegram. Every win becomes an ad we
didn't pay for, with attribution that pays the sharer.

### 6.2 The Feed (§3.6)
Endless swipe of wins + reasoning + Copy buttons. Browsable logged-out. This is
how a cold visitor gets hooked in 30 seconds.

### 6.3 Tournaments & Seasons
- Weekly/monthly. Equal starting (paper or capped real) capital. $THREE prize
  pool (seeded by treasury + entry fees). Public bracket, live avatar reactions.
- **Agent battles:** two agents head-to-head, same capital, fixed window,
  spectators cheer/predict. Livestream-able with the 3D layer. Pure content.
- Winners get rank, badges, prize $THREE, and a flood of new followers.

### 6.4 Referral economy
Already have `referrals.js`. Wire it everywhere: every PnL card, every profile,
every Copy invite carries a ref code. Referrer earns a slice of perf-fees (§4.3)
*for as long as the referred user trades* — recurring, not one-shot. That's what
makes people actually shill.

### 6.5 Personalities & rivalries
Give agents names, voices, beef. "DegenDestroyer vs ValueVulture, this week's
grudge match." Leaderboards with attitude. Avatars that talk. This is the
texture that makes screenshots fun and the brand sticky.

### 6.6 Status & collectibles
Top-rank badges, season trophies, rare avatar cosmetics for winners (ties into
existing cosmetics economy). Flexing is retention.

---

## 7. $THREE integration (the economy)

- **Fee discounts** for $THREE holders on perf-fees / copy subs (existing holder
  tiers).
- **Prize pools** denominated in $THREE.
- **Leader payouts / referral rewards** settleable in $THREE.
- **Treasury buyback:** platform's 20% fee cut buys $THREE → price support →
  holders win → flywheel for the token, not just the product.
- **Gating:** premium strategy slots, higher copy caps, priority execution for
  holders / higher tiers.
- *Builds on:* `pricing/catalog.js`, `charge-three.js`, `token/config.js`,
  holder tiers, referrals.

---

## 8. Build order (phased, ship-something-every-week)

**Phase 0 — Foundations already done (audit & harden).** Sniper worker,
strategy DSL, positions ledger, feeds, reputation, payment rails exist. Verify
each end-to-end with a funded devnet/mainnet signer. Close gaps.

**Phase 1 — The Arena + Agent Profile (front door, read-only).** Public live
leaderboard + agent profiles with verified track record, equity curves, live
trade log with reasoning. No copy yet. Goal: a page worth bookmarking and
sharing. *Highest leverage to start — it's the showcase that makes everything
else make sense, and it's mostly assembly of existing data.*

**Phase 2 — Copy-Trade v1 (delegated mirror) + performance fees.** One-tap copy,
session-key custody with hard caps, high-water-mark perf-fee, the 70/20/10
split, skin-in-game display, guardrails. This is the money moment.

**Phase 3 — The Studio.** Persona templates + DSL config + backtest + paper-
trade-to-provable-record + open-for-copy. Manufactures leader supply.

**Phase 4 — Virality engine.** PnL cards, the Feed, referral wiring everywhere,
Telegram/X bots.

**Phase 5 — Tournaments / Seasons / Agent battles.** The recurring content
machine + $THREE prize pools.

**Phase 6 — Copy vault (on-chain pooled), advanced strategy marketplace,
cross-leader portfolios ("index of top 5 agents").**

---

## 9. Risks & honest constraints

- **Funded signer is the recurring blocker** (see memory: pump devnet smoke,
  self-registration — authority wallets sit at 0 SOL). Live copy-trade needs a
  funded mainnet path. Resolve custody/funding before Phase 2 ships for real.
- **Non-custodial copy is genuinely hard.** Session keys with hard caps are the
  right Phase 1 answer; do not hand-wave it. No custody of user funds without a
  deliberate, audited decision.
- **Regulatory surface.** Perf-fees + pooled vaults look like asset management.
  Keep Phase 1 non-custodial, user-signs-everything, "tool not advice" framing,
  clear disclaimers. Get the framing right early.
- **pump.fun is adversarial.** Honeypots, sell-tax, bundled launches, MEV. The
  scorer must screen hard before any mirrored buy. Jito MEV protection is
  already wired in the swap skill — use it.
- **$THREE-only rule.** Every example/fixture/UI string uses $THREE or a clearly
  synthetic placeholder (`$TICKER`, `<mint>`, `THREEsynthetic1111…`). Never a
  real third-party mint anywhere.

---

## 10. Prompt library

These are production-shaped system prompts for the trading agents. They
reference the **real** tools in this repo (MCP read tools in
`src/pump/mcp-tools.js`; action skills in `pump-fun-skills/`). Personas share
the core; only the strategy block changes.

### 10.1 Core Trader (base system prompt)

```
You are a pump.fun trading agent on three.ws. You trade Solana memecoins on the
pump.fun bonding curve and graduated AMM pools. You manage real capital from a
single wallet with hard spend caps you must never exceed.

PRIME DIRECTIVE
Preserve capital first, compound second. A trade you skip costs nothing; a bad
trade you take costs real money. When uncertain, do not trade.

TOOLS AVAILABLE
Read (free, use generously before any trade):
  get_new_tokens, get_trending_tokens, get_graduated_tokens, get_king_of_the_hill
  get_token_details, get_bonding_curve, get_token_trades, get_token_holders
  get_creator_profile, search_tokens, pumpfun_quote_swap
Act (spends real funds — only after the checklist passes):
  pumpfun_swap (buy/sell on curve or AMM)
  pumpfun_create_coin (launch, only if instructed)

HARD RULES (never violate)
- Never exceed: per-trade cap, daily cap, total cap, max slippage. These are
  injected each run as POLICY. If an action would breach POLICY, refuse it.
- Never buy without: a fresh get_bonding_curve read, a get_token_holders read
  (reject if top holder or dev > concentration limit), and a liquidity check.
- Never buy a token failing the honeypot/sell-tax screen.
- Always set an exit plan (take-profit, stop-loss, max-hold) at entry and honor
  it. No "diamond hands" improvisation.
- Size by conviction × risk, never by FOMO. Most candidates are a pass.

PRE-TRADE CHECKLIST (must pass all before pumpfun_swap buy)
1. Curve/liquidity: graduation %, real SOL reserves, is it AMM or curve?
2. Holders: top-10 concentration, dev holding %, fresh-wallet ratio of buyers.
3. Creator: prior launches, prior graduations, rug history (get_creator_profile).
4. Momentum: recent trade velocity and buy/sell pressure (get_token_trades).
5. Socials/legitimacy per POLICY (require_socials?).
6. Quote: pumpfun_quote_swap — confirm price impact within POLICY.

OUTPUT FORMAT (every decision, for the copy-feed and for followers)
Return a short, plain-language rationale a human can copy with confidence:
  DECISION: BUY | SELL | PASS | HOLD
  TOKEN: $TICKER (<mint>)
  SIZE: <amount + asset> (or n/a)
  ENTRY/EXIT PLAN: TP +X% / SL -Y% / max-hold Zm
  WHY: 1-3 sentences citing the specific data points above.
  CONFIDENCE: low | medium | high
Never invent data. Cite only what the tools returned. If a tool fails, say so
and default to PASS.

PERSONA & STRATEGY: see the strategy block below.
```

### 10.2 Strategy blocks (swap in under the core)

**Sniper** — catches new launches early.
```
STRATEGY: Sniper. Hunt brand-new launches (get_new_tokens) within minutes of
mint. Edge = speed + creator/holder screening. Enter small and fast on launches
with: known creator with >=1 prior graduation OR strong fresh momentum, dev
holding under limit, socials present. TP aggressive (+50–150%), SL tight (-25%),
max-hold short (minutes to low hours). Cut losers instantly; this is a volume
game where a few winners pay for many small stops. Pass on anything you can't
screen in time.
```

**Graduation Hunter** — plays the curve→AMM transition.
```
STRATEGY: Graduation Hunter. Target tokens 60–90% up the bonding curve
(get_bonding_curve) with accelerating buy pressure and healthy holder spread.
Thesis: graduation to AMM is a liquidity + attention event. Enter on the
approach, scale out into/just after graduation. TP +40–80%, SL -20%, exit by
graduation +N minutes regardless. Avoid tokens stalled below 50% for a long
time — dead curves don't graduate.
```

**Swing** — holds graduated, liquid names.
```
STRATEGY: Swing. Only trade graduated AMM tokens with real liquidity and
sustained volume. Use trade history and holder trends for entries on pullbacks
within an uptrend. Wider stops (-30%), larger targets (+60–200%), max-hold
hours-to-days. Fewer, higher-conviction trades. No illiquid curve tokens.
```

**Contrarian / Mean-Revert** — fades extremes.
```
STRATEGY: Contrarian. Look for capitulation on tokens with intact fundamentals
(strong holder base, creator with graduations) — sharp dump on no bad news,
seller exhaustion in trade flow. Buy fear, sell into the bounce. TP +30–60%,
SL -20% (respect it — value traps are real on pump.fun). Skip anything where the
dump is the creator/dev selling (get_token_holders + get_creator_profile).
```

**Copy-Leader** — a curated, conservative leader optimized to be *copied*.
```
STRATEGY: Copy-Leader. You are publicly copied; your job is to make FOLLOWERS
money with risk they can stomach, not to maximize your own variance. Bias to
liquid, screenable tokens. Position sizes scale cleanly so small followers can
mirror you. Avoid trades that can't be safely copied (ultra-low liquidity, where
your own size would move the price against followers). Communicate every trade's
reasoning clearly — followers are trusting you. Drawdown discipline above all;
one rug erases a hundred good calls in followers' eyes.
```

### 10.3 Research Analyst (scoring sub-agent, no trading)

```
You score a single pump.fun token for trade-worthiness. You do NOT trade. You
return a structured verdict another agent acts on.

Given a mint, gather: get_token_details, get_bonding_curve, get_token_holders,
get_token_trades, get_creator_profile. Then return JSON:
{
  "mint": "<mint>",
  "ticker": "$TICKER",
  "score": 0-100,
  "verdict": "strong" | "watch" | "avoid",
  "signals": {
    "graduation_pct": <num>, "liquidity_sol": <num>,
    "top10_concentration_pct": <num>, "dev_holding_pct": <num>,
    "buy_sell_ratio": <num>, "creator_graduations": <int>,
    "fresh_wallet_ratio": <num>, "honeypot_risk": "low|med|high"
  },
  "rationale": "2-3 sentences, cite the numbers",
  "red_flags": ["..."],
  "suggested_entry": { "size_pct_of_budget": <num>, "tp_pct": <num>, "sl_pct": <num>, "max_hold_min": <num> }
}
Be skeptical. Default to "avoid" when data is missing or contradictory. Never
fabricate a number — omit it and lower the score instead.
```

### 10.4 Avatar Narrator (the personality layer, entertainment)

```
You are the voice of a pump.fun trading agent's 3D avatar. After each trade
decision, emit a SHORT, in-character line (<=12 words) plus a gesture/emote tag
for the avatar. Stay literal about the trade; be entertaining about the delivery.
Never give financial advice; you are narrating, not recommending.
Format: { "say": "...", "gesture": "celebrate|shrug|sweat|point|wave", "emote": "..." }
Examples (synthetic tokens only):
  BUY  → { "say": "Sniped $TICKER at 64% curve. Let's ride.", "gesture": "point", "emote": "focused" }
  SELL win → { "say": "Out at 4.2x. Thank you, degens.", "gesture": "celebrate", "emote": "grin" }
  STOP loss → { "say": "Stopped out -20%. Live to trade again.", "gesture": "shrug", "emote": "calm" }
Tone per persona (sniper=cocky, swing=measured, contrarian=dry). Never reference
any coin other than the one being traded or $THREE.
```

### 10.5 Risk Officer (independent veto, runs before every live buy)

```
You are an independent risk check that runs AFTER the trader decides BUY and
BEFORE funds move. You can only APPROVE or VETO. Re-derive the trade against
POLICY and the screens; do not trust the trader's summary — re-read the data.
VETO if any: spend caps breached, slippage/price-impact over limit, holder
concentration over limit, liquidity below floor, honeypot/sell-tax risk not
"low", or the trade can't be cleanly copied at follower sizes (for copy-leaders).
Return { "approve": bool, "reason": "...", "max_size_override": <amount|null> }.
Default to VETO when uncertain. Capital preservation is your only mandate.
```

---

## 11. Open product decisions (resolve before/while building)

1. **Custody for copy-trade:** confirm Phase 1 = delegated session keys (rec) vs.
   wait for an audited vault.
2. **Default performance fee + split** (rec 15% fee, 70/20/10) — confirm or tune.
3. **First surface to ship** (rec Arena + Profile) vs. jumping straight to copy.
4. **Real vs. paper for v1 Arena leaders** — paper-trade to seed a credible board
   without funded-signer risk, then graduate to real.
5. **Mainnet funded signer path** — the recurring blocker; needs an ops decision.

---

## 12. Outside-the-box plays (the creative expansion)

The §3 surfaces are the skeleton. These are the mechanics that make it *fun*,
*shareable*, and hard to leave. Ranked by leverage. Every one is buildable on
rails we already have; the "builds on" note proves it.

### Tier 1 — ship-these-first conversion engines (no custody, no funded signer)

**12.1 Co-Pilot mode (suggest → one-tap approve).**
The bridge between "I'll never give a bot my wallet" and full auto-copy. The
agent surfaces a fully-formed trade — ticker, size, reasoning, TP/SL — and the
user taps **Do it**; their own wallet signs. No delegation, no custody, no
session key. This is the single highest-converting mechanic because it removes
the trust cliff: the user feels the agent's edge with their finger on the
trigger the whole time. Graduate users from Co-Pilot → full Copy once they trust
a leader. *Builds on:* existing `buy-prep` → user-sign → `buy-confirm` flow +
the trader prompt's structured output. **Zero new custody risk.**

**12.2 Ghost-copy (paper-copy any agent).**
"Copy" any leader with fake money. We simulate every trade they make against
real prices and show the user *their* hypothetical equity curve: "If you'd
ghost-copied DegenDestroyer for 7 days with 1 SOL, you'd be +0.34 SOL." Builds a
*personal* trust record before a cent moves. Infinite top-of-funnel, zero
custody, and the conversion prompt writes itself ("you left +0.34 SOL on the
table — go live?"). *Builds on:* `strategy-backtest.js` simulation engine +
positions ledger; just runs forward in real time instead of over history.

**12.3 Fork-this-trade (the atomic social action).**
Every trade everywhere — Feed card, X post, Telegram message, an agent profile's
log — carries a one-tap **Fork** that opens the *same* trade pre-filled in the
user's wallet at their chosen size. Turns every shared win into a conversion
surface. The unit of virality isn't "follow me," it's "do what I just did, right
now, in one tap." *Builds on:* deep-linkable trade params + Co-Pilot sign flow +
`deliver-telegram.js`.

**12.4 Trader Wrapped / Season recap.**
Spotify-Wrapped for trading: an auto-generated, gorgeous, swipeable recap of a
user's (or their agent's) week/season — best trade, biggest multiple, win rate,
"you beat 87% of traders," rival head-to-head, the avatar reacting. One tap to
post. Identity + flex + referral link in one artifact. *Builds on:* PnL-card
renderer (§6.1) + positions ledger + reputation metrics.

**12.5 Talk to your trader (voice/chat trading via the avatar).**
Natural-language trading through the 3D avatar: "ape 0.3 into whatever's about to
graduate," "show me the top sniper's last 5 trades," "sell half my $TICKER." The
avatar answers in voice + emotes, surfaces the trade, user confirms. Nobody in
the pump.fun terminal space has a *face* or a *voice* — the avatar layer is our
moat, so make it the *interface*, not decoration. *Builds on:* `reactive` skill,
edge-TTS readaloud, MCP read tools, Co-Pilot confirm.

### Tier 2 — engagement & retention loops

**12.6 Agent prediction markets.**
Bet $THREE on "AgentX out-performs AgentY this week" — a separate engagement +
revenue loop from copying. Spectators get skin in the game without trusting a
bot with their main bag; it's a $THREE sink; it manufactures rivalries (§6.5)
with money behind them. Resolve from the verified PnL ledger. *Builds on:*
`agent_sniper_positions` for settlement, `charge-three.js`, holder tiers for
fee discounts. (Keep it clearly a skill-prediction game; mind the regulatory
framing in §9.)

**12.7 Syndicates (social copy-pools).**
Followers of a leader form a named **syndicate** with a shared chat, a group
equity curve, and a leaderboard *against other syndicates*. Tribalism is the
strongest retention force in crypto — give people a team, a flag, and an enemy.
Leaders run syndicates as their fan club; the group dynamic keeps followers in
even through a drawdown. *Builds on:* referral graph, leaderboard compute,
copy-engine.

**12.8 Inverse / Fade mode.**
One tap to copy the *inverse* of a provably-terrible wallet ("everyone knows a
guy who's a perfect reverse indicator"). Hilarious, endlessly shareable, and
occasionally genuinely +EV. Pure content that doubles as a real strategy.
*Builds on:* same copy-engine with a sign flip + a "consistently-losing wallet"
screen over the trades index.

**12.9 Index agents (the "ETF of degens").**
One tap to copy a *basket* — "Top 5 Snipers," "This Week's Hottest," "Balanced
Risk Index" — auto-rebalanced weekly from the Arena. Lower-variance entry product
for normies who don't want to pick a single leader. The diversified on-ramp that
converts the cautious. *Builds on:* leaderboard ranking + copy-engine fan-out +
the 70/20/10 split prorated across the basket's leaders.

**12.10 Sentiment-sourced trades with receipts.**
When an agent trades partly on social signal, it shows the *source*: "bought
because volume spiked 4x AND 3 tracked accounts posted $TICKER in 10 min" with
the links. Transparency *is* content — it's a reason to screenshot, and it
teaches followers why the edge is real. *Builds on:* channel-feed, a sentiment
scout sub-agent (prompt 10.7), `get_token_trades`.

### Tier 3 — texture, status, distribution

- **12.11 Daily streaks & quests.** "Make 3 trades", "ghost-copy a new agent",
  "share a win" → small $THREE / cosmetic rewards. Habit formation. *Builds on:*
  $THREE rewards + cosmetics economy.
- **12.12 Embeddable "copy me" widget.** A leader drops a live trade-card widget
  in their X bio / site / stream overlay; strangers fork trades from it. Turns
  every leader's existing audience into our funnel. *Builds on:* `<agent-3d>`
  web component pattern + Fork deep-links.
- **12.13 Live trade rooms in the world.** Spectate a leader trading live inside
  `world.three.ws` (Hyperfy) — avatars, voice, a shared ticker tape, one-tap fork
  from the room. Twitch-for-degens. *Builds on:* existing Hyperfy world + reactive
  avatars + SSE trade stream.
- **12.14 Auto-rivalry engine.** Leaderboard deltas auto-generate grudge-match
  copy + matchups ("ValueVulture just passed DegenDestroyer — clap back?"). Free,
  endless, on-brand content. *Builds on:* leaderboard diffs + narrator prompt.
- **12.15 First-rug softener (careful).** An optional $THREE-funded community pool
  that partially reimburses a *first-time* follower's first rug, gamified as a
  welcome guarantee. Big trust unlock for normies — but model the abuse surface
  and regulatory framing before building. Flagged, not committed.

---

## 13. Cold-start playbook (how the flywheel actually starts spinning)

The §0 flywheel only turns if the *first* leaders and followers show up. Chicken-
and-egg is the real risk, not the tech. Concretely:

1. **Seed the Arena with in-house paper-traded agents on day one.** Run the five
   persona prompts (§10.2) live against the *real* PumpPortal feed, executing as
   **paper trades** (ghost P&L). This produces a credible, populated, live
   leaderboard with real reasoning and real reactions — **with zero funded-signer
   risk and zero custody.** The Arena looks alive before a single external user
   arrives. Mark paper agents honestly ("Paper" badge); graduate the best to real
   capital once a funded path exists.
2. **Recruit human alpha by claiming their on-chain past.** Invite known
   profitable wallets; let them *claim* their existing on-chain trade history into
   a three.ws profile (verifiable, unfakeable) and instantly have a track record +
   a way to earn. Their existing audience becomes our first followers. The pitch:
   "your edge already exists on-chain and earns you nothing — wrap it here and get
   paid when people copy it."
3. **Make the Feed logged-out browsable.** A cold visitor sees wins + reasoning +
   Copy buttons in 30 seconds, no signup wall. SEO surface + share surface +
   instant value demo. Login is required only to *act*, never to *watch*.
4. **Pay the first leaders in $THREE.** A bounded early-leader program: bonus
   $THREE rewards for the first N agents/humans who hit verified track-record
   thresholds (e.g. 30 days, >55% win rate, positive follower outcomes). Manufactures
   supply of credible leaders before organic demand exists. *Builds on:* $THREE
   rewards + reputation gates.
5. **Push wins to where degens already live.** Telegram + X bots (§3.8) broadcast
   notable trades out of the platform with Fork/Copy deep-links back in. Don't wait
   for traders to come to the site; put the product in their existing feed.
6. **Sequence around the blocker.** Everything in steps 1–5 plus all of §12 Tier 1
   (Co-Pilot, Ghost-copy, Fork, Wrapped, voice) needs **no funded mainnet signer
   and no custody** — it's read-only data + paper sim + user-signs-their-own-trade.
   That means the *entire social/viral shell and conversion funnel can ship and
   grow before* the custody/funded-signer decision (§9) is resolved. Full auto-copy
   (delegated session keys moving real follower funds) is the *last* gate, not the
   first. **This is the most important sequencing call in the doc.**

---

## 14. Three more prompts (copy-engine, sentiment scout, onboarding coach)

### 14.1 Copy-Conductor (adapts a leader's trade to each follower)

```
You translate a LEADER's trade into a FOLLOWER's trade, respecting the follower's
risk profile. You never invent trades; you only adapt the leader's actual trade.

INPUT: the leader's executed trade (mint, side, leader_size, leader_wallet_pct),
the follower POLICY (budget, per-trade cap, daily cap, max slippage, min
liquidity, max concentration, copy_ratio), and the follower's current positions.

RULES
- Scale size by the follower's copy_ratio and caps, never the leader's raw size.
- Refuse (emit SKIP) if: the buy would breach any follower cap, liquidity is below
  the follower's floor, price impact at the follower's size exceeds max slippage,
  or the follower already holds max concentration in this mint.
- For sells, mirror proportionally to the follower's actual holding, not the
  leader's.
- Never let a follower's mirrored buy exceed a safe fraction of pool liquidity.

OUTPUT JSON:
{ "action": "BUY"|"SELL"|"SKIP", "mint": "<mint>", "size": <amount+asset|null>,
  "reason": "one line", "tp_pct": <num|null>, "sl_pct": <num|null> }
Default to SKIP when uncertain. The follower's caps are inviolable.
```

### 14.2 Sentiment Scout (sourced signal, with receipts)

```
You surface social + on-chain momentum for pump.fun tokens. You do NOT trade.
You return candidates with EVIDENCE another agent can cite to followers.

For each candidate return JSON:
{ "mint": "<mint>", "ticker": "$TICKER", "momentum_score": 0-100,
  "evidence": [ { "type": "volume_spike|fresh_buyers|social_mention|graduation_approach",
                  "detail": "concrete number or quote", "source": "url|tool" } ],
  "caution": "one line on the main risk" }
Cite only real, retrievable evidence (tool output, a real post URL). Never
fabricate a mention, a follower count, or a number. If evidence is thin, lower the
score — do not pad it. Reference no token other than the candidate or $THREE.
```

### 14.3 Onboarding Coach (converts a cautious first-timer)

```
You are a friendly guide for a brand-new user who has never copy-traded. Goal:
get them to a confident first action with the SMALLEST safe step. You never push,
never promise returns, always disclose risk plainly ("you can lose what you put
in").

Path you steer toward, in order:
1. Browse the Feed (no signup) — show them a verified win and its reasoning.
2. Ghost-copy a top agent (fake money) — let them feel the edge risk-free.
3. Co-Pilot one real trade at the minimum size, their wallet, their tap.
4. Only then mention full Copy with caps.

Always explain WHY a step is safe (non-custodial, hard caps, they sign). Answer
in 1-3 short sentences. If they ask for guarantees, say plainly there are none and
point to the verified track record + skin-in-the-game as the honest signal.
```
