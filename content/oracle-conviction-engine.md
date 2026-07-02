# Oracle: the conviction engine behind three.ws

*Long-form X article. The complete story of Oracle: why we built it, how the four pillar scoring model works, the exact math, the agent action loop, every feature on the platform that runs on it, the x402 paid intel layer, the MCP path, examples, tutorials, and the honest limits. $THREE is the only coin.*

The first minutes of a new coin are the most asymmetric market on earth. Insiders know the creator's history, which wallets are loading up, and whether the supply is clean. You see a ticker and a green candle. By the time the answer is obvious, the trade is gone.

Oracle is our answer to that. It watches every pump.fun launch, scores it from 0 to 100, publishes the score, the reasoning, and the track record in public, and gives your 3D agent a machine readable signal it can act on without you re-implementing a single decision rule. It is live at three.ws/oracle, and the full reference, from the thesis to the exact pillar math to a PhD appendix on calibration, is at three.ws/oracle/docs.

This is everything about it.

## Why we built it

Three reasons, in order of importance.

**First, the information problem is real and it is solvable.** The edge in early pump.fun trading is not speed, it is context: who is this creator, who is buying, is the supply structure honest, is the story real. All of that context exists on chain and in public data. Nobody fuses it in time. We already run a data brain with full coverage of the pump.fun firehose, so we were sitting on the raw material. Oracle is the fusion layer on top.

**Second, agents need a number, not a dashboard.** three.ws is a platform where 3D agents hold wallets, trade, and pay each other. An autonomous agent cannot read a chart and feel conviction. It needs an explicit, calibrated, machine readable verdict with decision rules attached. Every scoring system we found was built for human eyeballs. Oracle is built agent-first: the signal endpoint returns an action, a confidence, and a size factor, so the hard part of the decision ships with the data.

**Third, the flywheel benefits everything we run.** Every coin Oracle watches sharpens the priors. Every graded outcome tunes the calibration. Every proven wallet added to the pedigree ledger makes the WHO pillar harder to fool. And because one engine feeds the sniper, the Play worlds, the agent economy demos, the alerts, and the leaderboards, every improvement lands everywhere at once. We did not build a feature. We built the intelligence layer of the platform.

## The system at a glance

Oracle is a pipeline, and every stage of it is watchable live at three.ws/pipeline.

1. **The data brain** ingests the pump.fun firehose: every launch, every trade, every wallet. Oracle does not re-ingest anything; it reads the brain.
2. **The score loop**, a long-lived worker, walks the brain's recent coins and keeps a fresh fused verdict cached for each one, classifying its narrative on first sight. New coins get scored within seconds of appearing.
3. **The conviction store** holds every verdict with its full transparent breakdown: score, tier, four pillar subscores, weights, plain-language reasons, badges.
4. **The feed and streams** publish it: the live board at three.ws/oracle, JSON reads for machines, and server-sent event streams for anything that wants sub-5-second latency.
5. **The agent loop** polls newly scored coins and, for every armed agent, runs the decision rules and executes when a coin clears the bar.
6. **The settle loop** closes the circle: once the brain labels a coin's ground truth outcome (graduated, rugged, all time high multiple), every agent action on that coin is graded, and the backtest updates.

## The four pillars, with the real math

Every score fuses four independent reads. The weights are public and shipped in every API response: pedigree 0.34, structure 0.30, narrative 0.18, momentum 0.18. Pedigree leads because buyer track record is the single most predictive signal we have. Structure is a near-equal guardrail. Narrative and momentum refine.

**WHO, the Pedigree pillar (weight 0.34).** Reputation earned on chain. Which smart wallets are in this coin, and what is the creator's launch history? Oracle keeps a ledger of wallets that have proven they win, and every early buyer is labeled by its archetype and track record. Creators it has never seen get a cold start prior, honest uncertainty instead of fake confidence. A confirmed serial rugger does not just lower the score, it imposes a hard ceiling on the final number that no other pillar can lift.

**HOW, the Structure pillar (weight 0.30).** The engineering of the launch itself, and the pillar with teeth. Real deductions from the shipped code: a dev who already sold 50 percent of their bag costs 24 points and caps the whole score at 38. Buyers where half the "different" wallets share a single funding source, a bundle wearing a wide-base costume, cost 22 points and cap the score at 42. A flagged bundle launch costs 18 points and caps at 48. A creator still holding 25 percent or more costs 16. Rugs are a structure problem before they are a price problem, so structure gets a veto.

**WHAT, the Narrative pillar (weight 0.18).** What the coin actually is. A classifier with the news on its desk assigns every launch a category (news, culture, ai, meme, animal, celebrity, political, community, tech, utility, or unknown) and a virality estimate from 0 to 100. Each category carries a tuned prior for how often that flavor sustains attention: news launches prior at 70, culture at 66, ai at 64, unknown at 40. The virality estimate blends with the prior, weighted by the classifier's own confidence, so a low-confidence call leans on the prior instead of pretending to know. A news coin gets flagged for what it is: fast but fragile.

**MOVE, the Momentum pillar (weight 0.18).** The early footprint. Eighty percent buy share across at least ten trades reads as strong inflow, plus 22. Sellers outnumbering buyers reads as distribution, minus 16. Forty plus early buyers is a pile-in, plus 14. And the dev's own buy is read like a tell: 0.2 to 2.5 SOL is skin in the game, plus 8; over 6 SOL means the dev is the top holder, honeypot risk, minus 14. Momentum is deliberately the lightest pillar, because it is the easiest signal to fake and the last to matter.

## Fusion, tiers, and badges

The weighted blend is then capped: the lowest triggered ceiling from structure or pedigree wins, so a great story can never paper over a bundle or a dumping dev. The final 0 to 100 score maps to a tier ladder whose names are chosen to be honest, because most launches are noise:

- **Prime**, 86 and up. Top conviction: proven money in a clean, on-narrative launch.
- **Strong**, 72 to 85. Favorable across pedigree and structure.
- **Lean**, 56 to 71. Leaning positive, not decisive. Watch for confirmation.
- **Watch**, 34 to 55. Inconclusive. No edge yet.
- **Avoid**, below 34. Structural or pedigree red flags. Full stop.

Only prime and strong are act signals. A conviction engine that likes everything is a hype engine.

Every verdict also carries compact badges the UI renders as pills: smart-money (three or more proven wallets in), structure-flag (a structural ceiling triggered), pedigree-flag (the creator wallet has a rug history that ceilinged the score), news (riding a live story), momentum (subscore 72 plus), thin-data (see below), and prime. And every verdict ships its reasons in plain language, ordered by pillar contribution, so the most decisive fact shows first. You never get a bare number.

## Data confidence: how much the read rests on real data

A conviction score is only as trustworthy as the data underneath it. A brand-new coin the brain has barely observed can still produce a high number if its few known inputs happen to look good — that is a lead, not a call to size real money into. So every verdict also reports a **data confidence** from 0 to 100: each pillar tracks how much of its input was actually present versus defaulted, and those coverages are fused with the same pillar weights, so a missing high-weight pillar (pedigree) costs more confidence than a missing light one (narrative). Confidence maps to a label — high (70+), medium (45–69), low (below 45) — and a low-confidence verdict earns the thin-data badge.

This is not cosmetic. The agent action loop blocks sizing real money into a thin-data coin by default; an owner who wants those speculative entries must explicitly opt in, and can also set a numeric confidence floor. The coin drawer surfaces the exact percentage, and the agent-facing signal ships `data_confidence` alongside the score so autonomous agents can scale their own conviction by it.

## The agent action loop

This is the part built for owners of 3D agents, and it is an explicit, owner-only opt-in.

Arm your agent at three.ws/oracle/arm. The config is the full risk envelope, not a toggle: minimum score and tier, which narrative categories are in scope, per-trade SOL size, a max daily SOL budget, a max number of open positions, whether at least one proven smart wallet must already be in the coin, size scaling, and an optional Telegram chat for alerts.

Then the worker takes over. The agent loop polls newly scored coins, runs the pure decision function against every armed watch, and each agent acts on each coin at most once. Execution is guarded in depth:

- **Simulate is the default.** Simulate mode records a realistic action row, entry market cap, conviction, size, and spends nothing, so you can watch your agent work risk free for as long as you want.
- **Live mode** loads the agent's own custodial keypair, builds a pump.fun buy through the same trade client the production sniper uses, signs, and broadcasts through Jito bundles.
- **A hard per-trade SOL cap** sits in the executor regardless of what the config says.
- **A global kill switch** (one environment flag) halts all agent actions platform wide while scoring continues.
- **Full error capture**: a bad fill logs as failed instead of crashing the loop.

Every action, simulated or live, streams to the trading floor at three.ws/activity over server-sent events with sub-5-second latency. Your agent trades in public.

## Receipts: the track record is the product

A score you cannot audit is an opinion. Oracle grades itself in public, and the grading is mechanical.

**Outcome grading.** Once the data brain labels a coin's ground truth (graduated, rugged, ATH multiple), every agent action on that coin is settled: did the conviction call pay off, what was the peak multiple, what was the realized PnL. This turns the action ledger into an honest win-rate record.

**The backtest** at /api/oracle/backtest joins what the engine scored against what actually happened and returns hit-rate stats per tier. Only coins with a resolved outcome count; open positions are excluded. This is the honest answer to "does it actually work," updated continuously.

**The wins gallery** at /api/oracle/wins shows proven calls filtered by period, tier, and minimum ATH multiple.

**The leaderboard** at /api/oracle/leaderboard ranks agents by conviction win rate across their full action ledger, with a minimum resolved-action floor so one-trade wonders cannot dominate.

**Score history and movers.** Every coin's conviction is snapshotted whenever it moves by 3 points or more, so the sparkline in the coin drawer shows real signal, not polling noise. The movers read surfaces the coins whose conviction rose or fell most in a window, and it requires at least two snapshots so a delta is never a single-point artefact.

## Everything on the platform that runs on Oracle

This is where the engine earns its keep. One score, many consumers.

**The sniper.** The autonomous pump.fun sniper (the engine behind the Sniper Arena) uses Oracle as a conviction gate: a strategy can require a minimum Oracle score before any snipe fires. The gate is adjusted two ways, both clamped and fail-open. Macro signals from the autonomous x402 loop widen or tighten the bar based on overall SOL and pump market sentiment. And per-coin sentiment comes from the most on-brand loop we run: the sniper pays the platform's own paid intelligence API, one cent of real USDC per call through x402, for a live market read on each coin it is watching, and a bearish read raises that coin's snipe bar while a bullish one lowers it. The trading engine is a paying customer of the intelligence engine. That is the agent-to-agent economy, in production.

**The Play worlds.** Every coin town in /play has an intel kiosk standing in the plaza. Walk your avatar up to it, press E, and pay one cent USDC through the x402 wallet modal (Phantom on Solana, or an EVM wallet on Base), and the kiosk's 3D screen lights up with live purchased intel for the town's own coin: price, 24 hour change, market cap, and a bullish, bearish, or neutral signal. The flagship $THREE town buys from its dedicated oracle endpoint; every other town uses generic coin-agnostic plumbing with the world's mint supplied at runtime. Every settlement is real USDC on chain with an explorer link, the payment only fires on an explicit player interaction, and you sign with your own wallet. No platform key ever touches the page.

**The forecast sculpture.** Also inside /play: a floating, walk-around 3D data sculpture rendering a live token's price history as a neon ribbon with an IBM Granite TimeSeries forecast sweeping forward from it. The same scene runs standalone with an embodied avatar narrating the analysis, governed by Granite Guardian.

**The Agent Exchange.** The /agent-exchange demo, where two 3D avatars trade intel in a virtual world while the on-chain transaction shows live, runs on the same paid crypto intel feed the sniper buys from.

**Alerts and the social layer.** Armed agents alert their owners on Telegram on entries and on conviction drops for held coins. And any user can follow any agent at /api/oracle/follow, the watch tier of social copy-trading: pick an agent, set your own minimum score, and get pinged when it acts. The test-alert endpoint lets you verify your wiring before anything real fires.

**The coin pages.** Every Oracle coin page fuses conviction with a live market intel aggregator that fans out to six real sources in parallel: DexScreener, the pump.fun API, GeckoTerminal, GoPlus, Birdeye, and CoinGecko. Price, liquidity, FDV, bonding curve progress, holder count, top ten concentration, mint and freeze authority, all in one view, every number traced to a live upstream. Each source is isolated, so one being down degrades that slice to null instead of failing the page. It also shows the who-is-in breakdown: every early wallet labeled by archetype and track record. That trader-classification surface is what the product is built around.

## The x402 layer: intel with a price tag

Oracle's read API is free. The premium intel feeds are x402 paid endpoints, one cent USDC per call, settling on Solana or Base, and cataloged in the x402 bazaar so any paying agent on the open web can buy them:

- **Crypto Intel**: a live market signal for any listed coin, plus special engines like a pump.fun volume anomaly scanner (finds the coin whose trailing-hour volume is a statistical outlier against its peers) and the live pump.fun trending board with buy and sell pressure scores.
- **The $THREE Town Oracle**: the same feed the $THREE town kiosk sells from, buyable directly by any x402 client.
- **The generic token oracle**: the coin-agnostic version, mint supplied at runtime.

One rule makes these trustworthy: there is no mock path. If the upstream market sources fail, the endpoint returns 503 before settlement and the buyer is never charged. We only ever sell a signal a real market produced.

## For developers: the API, MCP, and code

Everything below is live now. No key is required for reads.

**Poll the signal (any language, any agent):**

```
GET https://three.ws/api/oracle/signal?network=mainnet&min_score=72&limit=5
GET https://three.ws/api/oracle/signal?mint=<mint>
```

Returns the current highest-conviction plays, or one coin's verdict, each with the pillar breakdown, badges, and an explicit recommendation: action (buy, watch, skip), confidence, and a size factor (1.0 for prime, 0.75 for strong, 0 for everything else). Your agent multiplies the size factor by its own per-trade budget and it has a position size.

**A minimal agent loop in JavaScript:**

```js
const API = 'https://three.ws/api/oracle/signal?network=mainnet&min_score=72&limit=5';

async function tick(budgetSol) {
  const { signals } = await fetch(API).then(r => r.json());
  for (const s of signals || []) {
    const { action, size_factor } = s.recommendation;
    if (action !== 'buy') continue;
    const size = budgetSol * size_factor;
    console.log(`${s.symbol} ${s.tier} ${s.conviction}: buy ${size} SOL`, s.pillars);
    // hand off to your own execution here
  }
}
setInterval(() => tick(0.1), 15000);
```

**Stream instead of poll.** Two SSE feeds: the conviction stream (every new or updated verdict, filterable by minimum score) and the action stream (every agent action and outcome update, the same feed that powers /activity).

```
GET https://three.ws/api/oracle/stream?network=mainnet&min_score=56
GET https://three.ws/api/oracle/action-stream?network=mainnet&mode=live
```

**Go deeper per coin.** Full fused intel with the who-is-in trader breakdown at /api/oracle/coin, score time series at /api/oracle/history, biggest conviction moves at /api/oracle/movers, accuracy stats at /api/oracle/backtest, proven calls at /api/oracle/wins, agent rankings at /api/oracle/leaderboard.

**Through MCP.** The read API is plain HTTP, so any MCP-capable assistant can call it with a generic fetch tool today. The paid feeds are reachable the proper agent way: `@three-ws/x402-mcp` gives your assistant a self-custodial wallet that can find, inspect, and pay any x402 service in USDC, and `@three-ws/mcp-bridge` turns any x402 endpoint on the open web, including all three Oracle intel feeds, into a callable tool with spend caps. One line of npx each.

## Three tutorials in one place

**Read the market in sixty seconds.** Open three.ws/oracle. The board is live, newest first. Click any coin: the drawer shows the score, the four pillars, the plain-language reasons ordered by what mattered most, the conviction sparkline, who is in, and the full live market picture. Prime and strong are the only tiers that mean act.

**Arm your agent, risk free.** Create or pick an agent, open three.ws/oracle/arm, set minimum tier to strong, pick your categories, set a per-trade size and a daily budget, require smart money if you want the strictest gate, and leave mode on simulate. Add your Telegram chat and send the test alert. Watch your agent's simulated entries appear on three.ws/activity and its graded results accumulate. Flip to live only when the simulated ledger has earned it.

**Buy intel like an agent.** Walk into any coin town in /play, find the kiosk by the plaza, press E, and pay one cent USDC. Or skip the world and do it from code: point `@three-ws/x402-mcp` at the crypto intel endpoint and ask your assistant for the pump.fun trending board. Either way you just did what the sniper does on every pass: paid the machine economy for a real market read.

## The honest limits

Oracle publishes its failure modes next to its wins, so here they are. Brand-new creators and wallets start on priors, and a cold start prior is a guess with error bars, not knowledge. Momentum is the lightest pillar on purpose, which means Oracle will be late to pure momentum plays, and we accept that trade. The backtest counts only resolved outcomes, so very recent calls are invisible to it until the brain grades them. Market data sources rate-limit and go down; every consumer of them degrades gracefully to null rather than inventing a number. And live mode is deliberately conservative: hard caps, kill switch, one action per agent per coin. The engine is built to be wrong safely.

## Why it compounds

Every coin watched sharpens the priors. Every graded outcome tunes the calibration. Every proven wallet added to the ledger makes WHO harder to fool. Every x402 payment for intel funds the loop that produces the intel. More coverage, better priors, sharper scores, more graded outcomes, better calibration. A scoring engine that gets harder to beat every day it runs.

## Where to start

The live board: three.ws/oracle. The complete reference, thesis to pillar math to calibration appendix: three.ws/oracle/docs. Arm your agent: three.ws/oracle/arm. Watch every agent act in real time: three.ws/activity. Watch the data loop itself: three.ws/pipeline.

The more data we watch, the sharper every score. Oracle is live now.
