# The intelligence layer of three.ws: Smart Money Radar, coin intel, and the KOL desk

*Long-form X article. The complete story of the market intelligence surfaces on three.ws: the wallet reputation graph behind the Smart Money Radar, the Coin Intelligence Engine that scores every launch in its first ninety seconds, the KOL analytics desk, the sentiment and narrative SDK, the intel MCP servers, examples, tutorials, and the honest limits. $THREE is the only coin.*

Every pump.fun launch asks the same question: is the money flowing into this coin smart or dumb? Price cannot answer it. Volume cannot answer it. Only a memory of who these wallets are and what happened the last hundred times they bought something can. Nobody carries that memory in their head. So we built it as infrastructure.

The intelligence layer of three.ws is a set of live, public, first-party surfaces that answer who is buying, how the launch is engineered, what people are saying, and which named traders are positioning, for every coin on pump.fun, continuously. This article is that layer: the raw surfaces you can read directly, the graphs that feed them, and the developer paths into all of it.

## Why we built it

**First, wallet reputation is the highest-signal read in this market, and it must be first-party.** Every list of "smart wallets" you can copy from somewhere else is unverifiable, stale, and gameable. Our answer is a reputation graph computed entirely from trades we observed and graduations we recorded on chain. If our graph says a wallet wins, you can pull the coins it won on.

**Second, the first minutes of a launch contain the whole story, if something is watching.** Bundles, sniper swarms, dev dumps, and single-whale floats are all visible in a coin's opening seconds of trading, and invisible an hour later when the chart looks organic. A machine watching from second zero sees the engineering of the scam before the scam has a candle.

**Third, one intelligence layer, many consumers.** The same tables the Smart Money Radar renders are read by the sniper's firewall, the Oracle pedigree pillar, the copy-trade directory, the watchlist, and any MCP client on the open web. We did not build dashboards. We built a data brain and gave humans, agents, and paying machines the same read.

## The system at a glance

Seven live surfaces, one shared brain.

1. **The Smart Money Radar** (three.ws/smart-money): a wallet reputation graph built by crossing every coin's buyers with the coins that actually graduated.
2. **Coin Intelligence** (three.ws/coin-intel) and the **Coin Radar** (three.ws/radar): every launch observed in its first ninety seconds, classified organic versus bundle, risk-flagged, and scored by a model that retrains on labeled outcomes.
3. **The KOL desk**: named-trader analytics, a live leaderboard, per-wallet portfolio PnL, and per-mint trade scans across the tracked set.
4. **GMGN Smart Money** (three.ws/gmgn): a live cross-chain smart-money stream, narrated out loud by a 3D agent you pick.
5. **The attention surfaces**: Trending, the Watchlist, the Pump Visualizer, and the live launch streams.
6. **The reading SDK**: `@three-ws/intel`, one import for sentiment, narrative, momentum, and token snapshots.
7. **The MCP surface**: `@three-ws/intel-mcp` and `@three-ws/kol-mcp`, the whole layer as tools in any AI assistant, read-only, no key.

## The Smart Money Radar: reputation the chain cannot fake

The radar's engine is a rollup cron with three phases, and every rule in it is deliberate.

**Phase one: judge and fold.** A coin must be at least 6 hours old before it is judged, because that is when "never graduated" starts meaning something. The verdict is binary and first-party: if the mint appears in our graduation records, it is a win; otherwise it is a dud. No external price oracle, no guesswork. The cron reaches back at most 14 days, judges at most 80 coins per run, folds at most the top 60 wallets per coin, and folds each coin exactly once, bounded so a 5-minute cadence can never run away.

**Phase two: recompute reputation.** Every touched wallet gets its score re-derived from pure, unit-tested functions. A buy counts as early if it landed within 180 seconds of the coin first being observed. A wallet that sold back at least half of what it bought is marked as dumping on that coin, the behavior that hurts anyone following it. The score is transparent: win rate is the backbone, a bonus of up to 20 points rewards early skill (0.4 times the edge of its early win rate over its overall win rate), and a penalty of 0.4 times the dump rate pulls it down. The result is multiplied by a confidence factor that only reaches 1.0 after 12 judged coins. One lucky win is not smart money, and the math refuses to say it is.

**The labels are blunt.** A wallet that created 3 or more coins with zero graduations is a **rugger**, the most important flag for anyone following buys. Under 4 judged coins is **fresh**. A dump rate of 60 percent or more is a **dumper**. A score of 70 or above is **smart_money**. Five or more early entries with a win rate under 25 percent is a **sniper**, spray and pray, fast but not smart. Everything else is **neutral**.

**Phase three: score the live coins.** For every coin launched in the last 3 hours (up to 150 per run), the radar computes a pedigree score: the buy-weighted average reputation of the money in the coin, plus a bounded network bonus of 4 points per proven wallet piling in, capped at 5. Two details make it honest. Unknown wallets score zero and correctly drag the average down, so a coin full of anonymous money reads as unproven, not neutral. And creators are excluded entirely: a dev cannot lend pedigree to their own coin. A wallet counts as proven at reputation 70 and up, and the top 8 notable wallets ship with every verdict.

All of it is public at `GET /api/pump/smart-money`: the live feed of coins ranked by the pedigree of the money in them, the wallet leaderboard filterable by label, a per-wallet reputation card with its 30 most recent coins and their outcomes, and a per-coin view of exactly who is in it.

## The second graph: funder clusters and the sybil flag

A separate recompute job maintains a deeper graph at `GET /api/intel/smart-money`, built from observed buys joined against richer outcomes (graduated, pumped, rugged, plus all-time-high multiples) and against funder clusters: groups of wallets sharing a SOL funding source. This surface answers the question bundles are designed to hide: are these fifty buyers actually one person?

Ask it about a mint and you get the reputable wallets net-buying right now (bought more than they sold; a wallet that already dumped is not "in" the coin), a 0 to 100 smart-money score, every funder cluster in the book, and a **sybil flag** that trips when one cluster controls at least 50 percent of buy volume across 3 or more buyers. Ask it about a wallet and you get its realized reputation card and cluster membership. When the graph has no history for a coin or wallet, the response says `computed: false`, an honest "not enough data," never a fabricated number. The sniper's firewall and the Oracle pedigree pillar read this same graph.

## Coin Intelligence: the first ninety seconds

While the smart-money graphs judge the buyers, the Coin Intelligence Engine judges the launch itself: each new coin's first 90 seconds of trading, at a scale of roughly 15 to 20 thousand new mints a day. The engine runs in the always-on sniper worker and, independently, as a self-sustaining serverless cron that opens a PumpPortal WebSocket every 2 minutes, accumulates each new mint's create event and trades, and finalizes every observation through one shared code path: compute signals, classify, resolve the funding graph, cross-reference smart money, persist. That smart-money cross-reference earns a coin a bounded quality bonus, because it is the highest-predictive single feature in the engine.

The signals are the anatomy of a launch: a bundle score and an organic score, the snipe ratio, holder concentration at top 1, top 5, and top 10, the fresh wallet ratio, funding-graph connectivity, a coordination score, and timing entropy. On top sit named risk flags, five classified as danger flags: `bundle_launch`, `dev_dumped`, `single_whale`, `low_diversity`, and `fresh_wallet_swarm`. Every coin gets a 0 to 100 quality score and a verdict with teeth: a coordinated launch, a dev dump, or a single whale owning the float forces **Avoid** regardless of the score, because those are the patterns that lose money. Otherwise quality under 25 is Avoid, under 50 (or any flag) is Caution, under 72 is Watch, and 72 and up is Strong.

Within each coin, every early trader is labeled by its footprint: **creator** (the deployer), **bundled** (shares a SOL funder with another buyer), **sniper** (first trade within seconds of the coin appearing), and **whale** (a large share of buy volume). Labels stack, and the bubble-map view renders them.

**And the engine learns.** A second cron closes the loop: coins observed at least 60 minutes ago get their real outcome recorded (graduated, pumped, flat, or rugged) as ground truth, and once 50 labeled samples exist, per-signal predictive weights are retrained and persisted. The sniper's scoring function reads the latest weights, so the judgment sharpens as the dataset grows. The learning view at `GET /api/pump/intel?view=learning` shows exactly what the model has learned, weight by weight, because a model you cannot inspect is a model you cannot trust.

The radar feed lives at three.ws/radar, the full dashboard at three.ws/coin-intel, and machine reads at `GET /api/pump/coin-intel` with filters for minimum quality, category, and risk flag.

## The KOL desk: named traders, live records

The wallet graph tracks anonymous money. The KOL desk tracks the named kind.

**The tracked set** has a hard admission rule: a wallet must have realized at least 10,000 dollars of cumulative profit on Solana meme-token trades. **Per-mint scans** at `GET /api/kol/trades?mint=<mint>` fan out one Helius call per tracked wallet and return every buy and sell those traders made on that token: side, SOL size, token amount, per-trade price, USD value, timestamp, newest first. **Per-wallet portfolio cards** at `GET /api/kol/wallets?addresses=<list>` proxy a Birdeye portfolio read with the key held server-side, normalized to realized PnL, unrealized PnL, win rate, total trades, and the wallet's highest-value holding, cached for 60 seconds, with failures negative-cached for only 15 seconds so an outage is never rendered as a fake zero-PnL wallet. **The leaderboard** at `GET /api/kol/leaderboard?window=7d` ranks top Solana traders by realized PnL over 24-hour, 7-day, or 30-day windows from a live parsed source, and when that source is unreachable it returns empty rather than stale or fabricated rows. An honest empty state beats a confident lie.

Adjacent to it sits **the copy-trade Smart Money directory** at `GET /api/copy/smart-wallets`: a curated, deduplicated directory spanning Solana and BSC, categorized as smart money, launchpad, KOL, or sniper, sortable by profit, PnL, win rate, followers, or score, carrying wallet identity and 30-day performance only, never token mints. It is the browsing layer for copy trading, whose execution mechanics are the agent trading article's story.

## GMGN, Trending, and the attention surfaces

**GMGN Smart Money** (three.ws/gmgn) streams live smart-money accumulation signals over server-sent events at `GET /api/agents/gmgn-feed`, across Solana, Ethereum, Base, and BNB Chain, on windows from 1 minute to 24 hours, filtered by a minimum count of distinct smart buyers. The twist is the presenter: a 3D agent narrates the signals out loud as they land, and any public avatar can be your analyst. Market data with a face.

**Trending** (three.ws/trending) ranks two things with zero vanity metrics: the top 3D agents by real chat activity, derived live from usage events rather than a stored counter, and the top coins by Oracle conviction, filtered to freshly scored verdicts, across 24-hour, 7-day, and all-time windows.

**The Watchlist** (three.ws/watchlist) is deliberately account-free: the Watch button on any coin profile writes the mint into device-local storage (up to 200 coins, synced across tabs), and the page treats the list as a portfolio, aggregating market cap, volume, graduated count, average Oracle conviction, and the tier distribution, refreshing every 90 seconds. It sorts by conviction movers, fires a browser notification when a watched coin's tier upgrades, and a share link recreates the list on any device. The platform never learns what you watch.

**The Pump Visualizer** (three.ws/pump-visualizer) renders the live trending set as an interactive 3D scene fed by the trending API, per-coin Oracle conviction, network stats, and recent graduations. **Pump.fun Stream** (three.ws/pumpfun) and **Pump Live** (three.ws/pump-live) are the raw firehose: the browser opens the same PumpPortal WebSocket the ingestion cron uses, so you watch every launch land in real time, batch-enriched with Oracle conviction, while a 3D agent reacts live.

## Oracle: where the reads become one number

Everything above is deliberately unfused: each surface answers its own question with its own math. Oracle is the fusion engine on top, blending the pedigree graph, the launch-structure signals, a narrative classifier, and early momentum into a single calibrated 0 to 100 conviction score with tiers, badges, a public backtest, and an agent action loop under hard guards. That engine has its own long-form story; start at three.ws/oracle and the full reference at three.ws/oracle/docs. Here it is enough to say: when you read a conviction score anywhere on the platform, the surfaces in this article are what it is made of.

## Reading the crowd: the @three-ws/intel SDK

On-chain reads tell you what wallets do. `@three-ws/intel` tells you what people say, in one import with four reads.

**`sentiment(mint)`** wraps the public, key-free `POST /api/social/sentiment-pulse`: it pulls up to 200 recent pump.fun comments for the token, optionally folds in up to 200 text snippets you collected yourself, and scores the combined stream with a deterministic lexicon scorer. Deterministic matters: the same comments always produce the same score, reproducible and auditable, not an opaque model's mood. You get an overall score from minus 1 to 1, positive and negative percentages, and a per-source breakdown.

**`intel(query)`** and **`projects()`** are the narrative and momentum lanes, bridging a partner narrative-intelligence feed with the API key held server-side: what stories are moving, and which projects are spiking on momentum-ranked scans. **`snapshot(mint)`** returns a real-time Solana token snapshot: price, volume, holders, metadata. Every field comes from a live source; an unreachable provider yields `null`, never an invented number.

The same reads power the ambient surfaces: the 3D sentiment heatmap on agent screens is fed by `GET /api/intel/heatmap`, a live token field where $THREE is always pinned first and enriched with its own comment-sentiment pulse, while the other tiles carry market data only.

There is also a paid lane. The premium intel feeds are x402 endpoints at one cent USDC per call, settling on Solana or Base, with a strict no-mock rule: if the upstream sources fail, the call returns 503 before settlement and the buyer is never charged. The most on-brand consumer is our own sniper, whose enrichment loop pays the paid intel endpoint for a live read on each coin it is watching and folds the verdict into a per-coin adjustment on its snipe threshold, honored only while fresh, because new mints move too fast for stale opinions. The intelligence layer has a real paying customer in production, and it is us.

## The MCP surface: the whole layer as tools

Everything above is reachable by any AI assistant through two published MCP servers, both read-only, both keyless.

**`@three-ws/intel-mcp`** exposes six tools: `smart_money_coin` (score a coin by who is net-buying it, with reputable buyers, funder clusters, and the sybil flag), `wallet_intel` (one wallet's realized reputation card), `signal_feed` (a published signal feed's proven accuracy, hit rate, realized and follower ROI, and its recent emissions, each linked to the on-chain transaction that proves it), `kol_leaderboard` and `kol_trades` (the KOL desk), and `copy_smart_wallets` (the copy-trade directory).

**`@three-ws/kol-mcp`** is the per-wallet deep dive: `get_wallet_portfolio` (one tracked trader's live PnL card) and `get_wallet_trades` (that trader's buys and sells on a specific mint, filtered out of the cross-wallet scan).

Install is one npx: `npx -y @three-ws/intel-mcp` over stdio in any MCP client, with `THREE_WS_BASE` as the only knob for self-hosted deployments. Both servers surface honest zero-data states: `computed: false` means the graph has no history yet, `has_activity: false` means no recorded portfolio, and neither is an error. Docs live at three.ws/docs/mcp-intel.

## How people actually use it

**The scanner** keeps the Coin Radar open, filters to Strong verdicts, and clicks into the bubble map when a coin's buyers look too coordinated. The danger flags do the first pass; the funding graph settles arguments.

**The follower** works the Smart Money Radar leaderboard, opens a wallet card, reads 30 recent coins with outcomes, checks the dump rate, and only then follows. The label did the screening; the receipts did the convincing.

**The desk trader** cross-references KOL trades on the mint, the sybil flag from the cluster graph, the sentiment pulse from the comments, and the Oracle verdict on top. Four independent reads, never averaged into mush.

**The agent builder** never opens a page. Their assistant carries intel-mcp and kol-mcp, their code polls the coin-intel feed, and their execution path (guarded and capped, the agent trading article's territory) consumes the same tables.

## For developers

Everything below is live now. Reads need no key.

```
GET https://three.ws/api/pump/smart-money?min_score=20&limit=50
GET https://three.ws/api/pump/smart-money?leaderboard=1&label=smart_money&min_coins=8
GET https://three.ws/api/pump/smart-money?wallet=<addr>
GET https://three.ws/api/intel/smart-money?mint=<mint>
GET https://three.ws/api/pump/coin-intel?limit=50&min_quality=60
GET https://three.ws/api/kol/leaderboard?window=7d&limit=25
POST https://three.ws/api/social/sentiment-pulse
```

**A wallet-vetting function in JavaScript**, the same read the radar UI renders:

```js
async function vetWallet(addr) {
  const r = await fetch(
    `https://three.ws/api/pump/smart-money?wallet=${addr}`
  ).then((x) => x.json());
  const w = r.wallet;
  if (w.label === 'rugger' || w.label === 'dumper') return { follow: false, why: w.label };
  if (w.coins_judged < 8) return { follow: false, why: 'thin record' };
  return {
    follow: w.smart_money_score >= 70,
    why: `score ${w.smart_money_score}, win rate ${w.win_rate}%, dump rate ${w.dump_rate}%`,
    receipts: r.recent_coins.filter((c) => c.graduated).map((c) => c.mint),
  };
}
```

**A launch screen that combines both graphs**, structure and pedigree, before anything else runs:

```js
async function screenLaunch(mint) {
  const [intel, smart] = await Promise.all([
    fetch(`https://three.ws/api/pump/coin-intel?mint=${mint}`).then((r) => r.json()),
    fetch(`https://three.ws/api/intel/smart-money?mint=${mint}`).then((r) => r.json()),
  ]);
  const danger = ['bundle_launch', 'dev_dumped', 'single_whale'];
  if ((intel.risk_flags || []).some((f) => danger.includes(f))) return 'avoid: structure';
  if (smart.computed && smart.sybil_flag) return 'avoid: one funder cluster is the book';
  if (smart.computed && smart.smart_money_score >= 70) return 'proven money is in';
  return 'no edge yet';
}
```

**Or hand it all to your assistant.** Add `@three-ws/intel-mcp` to your MCP client and ask, in plain language, "who is buying this mint and are they real." The assistant walks the same endpoints with the sybil math already done.

## Three tutorials in one place

**Vet a wallet in two minutes.** Open three.ws/smart-money, switch to the leaderboard, filter to smart_money with a minimum of 8 judged coins, and open a card. Read the win rate, early win rate, and dump rate, then scan the recent coins for graduation marks. A long record with a low dump rate is worth watching. A rugger label just saved you.

**Autopsy a launch.** Open three.ws/radar and click any coin flagged in red. The detail view shows the bundle score, the concentration ladder, and the trader labels, and the bubble map draws the funding graph so you can see the "different" wallets sharing one funder. Then check the mint on three.ws/smart-money to see whether any proven wallet touched it. Usually none did. That is the lesson.

**Read the layer from your assistant.** Add intel-mcp with one npx line, then ask for the smart-money read on a mint, the wallet card of its biggest buyer, and the KOL trades on it, in one prompt. Three tools fire, and you never opened a tab.

## The honest limits

The reputation graph only judges what it observed: a wallet's history before we started watching does not exist to us, and a fresh label means exactly that. Judgment takes 6 hours by design, so the radar is deliberately late on brand-new launches; the Coin Intelligence Engine covers the early window with structure instead of pedigree. Graduation is a strict win definition: a coin that ran 10x and died pre-graduation still counts as a dud in the radar's ledger (the deeper graph's pumped and ATH outcomes soften this, but the strictness is the point). The KOL desk depends on upstream providers, and when they fail you get empty or null, never invented rows. Sentiment is a lexicon over public comments: reproducible and gameable in equal measure, which is why nothing on the platform treats it as more than one read among several. And the sybil flag catches shared funding, not shared intent: a cluster funded from an exchange wallet can evade it. Every gap is stated where the data is served, because intelligence that hides its blind spots is marketing.

## Why it compounds

Every judged coin extends every buyer's record. Every labeled outcome retrains the launch model's weights. Every new funder edge sharpens the sybil read. And because the sniper, Oracle, the copy directory, the watchlist, and every MCP client read the same graphs, each improvement lands everywhere at once. The layer has one input, time watching the market, and every consumer gets stronger on the same schedule.

## Where to start

The wallet graph: three.ws/smart-money. The launch anatomy: three.ws/radar and three.ws/coin-intel. The named traders: the KOL tools in three.ws/docs/mcp-intel. The narrated stream: three.ws/gmgn. What is hot: three.ws/trending. Your own list: three.ws/watchlist. The fusion on top: three.ws/oracle.

Judge the coin by who is buying it. The graph already knows. It is live now.
