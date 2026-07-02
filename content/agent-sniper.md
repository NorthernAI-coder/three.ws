# The agent sniper: the trading engine of three.ws

*Long-form X article. The complete story of the agent sniper: why we built it, the five entry triggers, the exact scoring and guard math from the shipped code, the Oracle gate, the one cent intel loop that makes the sniper a paying customer of its own platform, the self-custodial package with its CLI, MCP, and x402 faces, tutorials, and the honest limits. $THREE is the only coin.*

A new pump.fun coin exists for milliseconds before the bots see it. Thousands of snipers watch the same feed, and most of them are the same script: buy everything, dump fast, no memory, no judgment, no brakes. Speed is commoditized; discipline is the actual edge. A bot that buys every launch is not a trader. It is a donation.

The three.ws agent sniper is the other kind of machine: the autonomous trading engine behind the Sniper Arena, the hands of the Oracle conviction engine, and the platform's proof that a 3D agent with a wallet can run a real, risk-bounded trading operation in public. Every trade is signed by the agent's own wallet, verifiable on chain, streamed live, and graded against what actually happened. And in its most interesting loop, the sniper pays the platform's own paid intelligence API one cent of real USDC per read to tune its own decisions. The trading engine is a customer of the intelligence engine. That is the agent-to-agent economy running in production, not in a slide deck.

This is everything about it.

## Why we built it

**First, a score without hands is a spectator.** Oracle publishes a calibrated 0 to 100 conviction verdict on every pump.fun launch. A verdict only matters if something acts on it, inside a risk envelope, faster than a human can. The sniper is the actuator: it turns signals into positions and positions into graded outcomes, and those outcomes flow back into the platform's backtests and leaderboards.

**Second, the guardrails are the product.** Anyone can broadcast a buy. The hard engineering is everything that stops a buy: mandatory stop-losses, daily budgets in lamports, concurrency caps, fee headroom checks, price impact circuit breakers, idempotency claims, kill switches at three levels. The safest path is the default path, and every dangerous choice is an explicit, owner-only opt-in.

**Third, we wanted it self-custodial and open.** The production worker runs the platform's hosted agents, but the same engine ships as an npm package where your keys never leave your machine. One engine, four faces: a library, a CLI, an MCP server any assistant can drive, and an x402 paid HTTP API any agent on the open web can rent. If we are going to argue that autonomous agents should hold wallets and trade, the code has to be inspectable and runnable by anyone.

## The system at a glance

The production sniper is a long-lived Node worker, deliberately not a serverless cron, because an hourly tick cannot snipe a launch. Inside one process:

1. **The feed loop** holds the PumpPortal new-mint stream open and scores every launch the instant it exists.
2. **The intel watcher** observes each new coin's first seconds on a separate socket and drives the pickier strategies with a full picture: bundle likelihood, organic score, holder concentration, dev behavior.
3. **The first-claim poll** watches the on-chain pump.fun fee-claim stream for creators pulling rewards for the first time ever.
4. **The pre-launch radar** watches proven creator and smart-money wallets for the on-chain precursors of a launch, before it hits any public feed.
5. **The position sweep** re-quotes every open position on chain every five seconds and exits on a fixed priority order.
6. **The swarm loop** pools member agents' verified track records into reputation-weighted consensus buys from a shared treasury.
7. **The heartbeat** publishes liveness so /api/sniper/status can tell you, honestly, whether the engine and its feed are alive.

Every path converges on a single executor. There is exactly one function in the codebase that signs and broadcasts a buy, and every trigger, no matter how exotic, goes through its full guard stack.

## Five ways in: the entry triggers

A strategy declares its trigger, and the trigger decides which loop feeds it.

**new_mint** fires blind on the create event, so it leans on hard filters: market cap band, creator history, socials. The fastest trigger and the least informed, which is why the guard stack behind it matters most.

**intel_confirmed** waits for the Coin Intelligence Engine to finish observing a coin's opening seconds, then gates on a minimum quality score, a maximum bundle score, a maximum single-holder concentration, whether the dev has already sold, and which narrative categories are in scope. It trades a few seconds of speed for a real picture.

**alpha_hunt** scores on the fully enriched intel record, including the live smart-money graph read of who reputable is already in the coin.

**first_claim** is the patient one. It fires when a creator claims accrued rewards for the first time ever, filtered by a claim-size floor and ceiling in lamports, a freshness gate (claims older than five minutes are ignored by default), and an owner-set buy delay of up to ten minutes. A creator taking real fees has something to protect.

**prelaunch_radar** is block-zero precognition. It watches an auto-curated list of proven creator and smart-money wallets and detects the public, on-chain precursors of a launch: a watched wallet submitting a pump.fun create instruction (confidence 0.9), a watched wallet funding a brand-new deploy wallet (0.5), and that fresh wallet then submitting the create (0.85, the correlated mint). It acts only on public chain data, never on intercepting anyone's pending transaction, and it anchors its cursor on first sight of a wallet so it never backfills a stale launch. When RPC fails repeatedly it backs off exponentially, capped at two minutes, reports itself paused, and the feed-based paths carry on. It never fabricates a precursor.

## The scoring, from the shipped code

Entry scoring is pure and explainable. Every skip logs its reason, because the skip log is what you stare at when tuning a strategy.

For a fresh mint, hard filters short-circuit first: a non-SOL quote pair, a market cap outside the band, a creator with more launches than your ceiling or fewer graduations than your floor, missing socials when required. Then soft signals build the score: a point for socials, a point per coin the creator has graduated, a point for a dev initial buy of at least one SOL.

For an intel-confirmed coin the score is a composition: the quality score normalized to a 0 to 1 baseline, plus half the organic score, minus half the bundle score, plus an optional learned model, a dot product of the coin's numeric signals against trained weights, deliberately clamped to plus or minus 0.5 so a model can nudge the deterministic gates but never swamp them.

Every executed snipe records a self-rated confidence between 0.05 and 0.95 into the decision ledger: a 0.6 base, a bonus if the safety firewall said allow, a penalty if it said warn, and a penalty scaled by how much of the price impact budget the entry consumed. The sniper predicts its own outcomes; the settle loop grades them.

## The guard stack: everything that stops a buy

The order is fixed and every check short-circuits before any transaction is built:

1. **Global throttle.** A platform-wide sliding window, ten buys per minute by default.
2. **Concurrency cap.** Open positions per agent are counted from the store; at the cap, skip.
3. **Daily budget.** Per-agent spend is tracked in lamports per UTC day. A trade that would cross it is skipped; a strategy with no budget never trades at all.
4. **The Oracle gate** (below).
5. **Idempotency claim.** The engine atomically reserves the (agent, mint, network) slot before any transaction. A second event for the same coin, from any trigger, is skipped. One shot per coin per agent, ever.
6. **Wallet and headroom.** The agent's keypair is resolved; a missing wallet fails cleanly, never auto-provisioned. The engine requires roughly 0.012 SOL of headroom above the trade size, so a snipe can never drain the wallet below the cost of its own exit's fee.
7. **Price impact circuit breaker.** A fresh on-chain quote is taken; impact above the strategy's ceiling (10 percent in the reference strategy) aborts the buy.
8. **The safety firewall.** An optional rug and honeypot assessment runs after the quote, before broadcast. A block verdict cancels the trade; a firewall crash degrades to warn rather than killing the loop.
9. **The tip guard.** In live mode the executor routes through Jito bundles, and a tip is real SOL leaving the wallet, so it is checked against the same daily budget before it is appended. A tip that would cross the budget vetoes the trade.

Above all of that sit three kill switches: the per-strategy kill switch (which also exits any held position at market on the next sweep), disarming (new buys stop, open positions still exit on their rules), and the global kill, one environment flag that halts every buy across every agent while position management continues.

And one honest default frames everything: **simulate mode**. In simulate, the full pipeline runs against real on-chain quotes, every guard fires, every decision is logged, and the broadcast is skipped with the signature recorded as SIMULATED. Nothing is mocked except the final send. Every face of the engine boots in simulate; live is an explicit flag.

## The Oracle gate, and the sniper that pays for its own intel

This is the platform's favorite subsystem, because it closes a loop most platforms only draw on whiteboards.

A strategy can set a minimum Oracle conviction score. Before any snipe, the gate runs in layers.

**The rugpull veto fires first and unconditionally.** A fresh high or critical rug verdict from the paid token-intel pipeline, within the last hour, rejects the snipe no matter what the strategy says. The veto is fail-open on errors and expires with freshness, because new mints move fast and a stale rejection must not block forever. It can only ever make the sniper safer.

**Then the conviction threshold, adjusted twice.** The effective bar is the strategy's minimum score plus a macro adjustment plus a per-coin adjustment.

The macro adjustment reads the market-wide signals the autonomous x402 loop buys on three topics: SOL, the broader majors, and pump.fun activity, weighted 1.2, 0.8, and 1.5. A bearish read raises the bar by up to ten points per topic scaled by confidence; a bullish read lowers it by up to five. The total is clamped to plus or minus fifteen points. In a bearish tape the sniper demands more conviction; in a bullish one it loosens, modestly.

The per-coin adjustment is the one to remember. On a cadence, the Sniper Intel Enrichment pipeline selects the coins the sniper is actively watching: open positions first (a sentiment flip on a held coin is an exit signal), then the freshest Oracle candidates from the last twelve hours in the prime, strong, lean, and watch tiers. For each, up to eight per run, it pays POST /api/x402/crypto-intel one cent of real on-chain USDC through the platform's own x402 client and gets a live market read back. A bearish signal raises that coin's snipe bar by up to eight points scaled by confidence; a bullish one lowers it by up to four. Conservative on weakness, modest on strength, by design. The delta is clamped to plus or minus ten points, expires after thirty minutes, and fails open, so this layer can nudge a snipe but never dominate or hard-veto one.

Two details make the loop honest. The endpoint resolves each ticker against a real market listing and throws 503 before settlement when none exists, so the wallet is never charged for a coin with no real market read, and no signal is ever invented. And every paid call lands in the autonomous log with its transaction signature, so the sniper's intel bill is itself auditable on chain.

Sit with what that is: the trading engine spends its own money on the platform's paid API, per coin, per read, to change its own behavior, and the same purchased sentiment also powers an exit. When a held coin's paid read flips bearish with confidence of at least 0.7 while the position is underwater, the sweep closes it with the exit reason signal_flip. One purchase, two consumers. A machine buying intelligence from a machine, settled in USDC, with receipts: the agent-to-agent economy doing real work.

A gate result never hides its math. A rejection reads like oracle_below_min:58<64(base:60+macro:6+coin:-2), so you see which layer moved the bar.

## Exits: a fixed priority order, on-chain prices only

Open positions are swept every five seconds and re-quoted authoritatively on chain, not from a price feed. The exit decision is pure and evaluated in a fixed order so the reason is deterministic: stop-loss, then trailing stop, then take-profit, then timeout, then sentiment flip.

The details carry the judgment. The stop-loss is mandatory: a strategy without one is never armed, enforced by both a database check and a runtime filter. The trailing stop tracks a high-water mark but only arms once the position has actually been in profit, so a coin that never moves up cannot trail-stop on entry noise. The timeout is a hard time-stop against the slow bleed. A failed sell leaves the position open so the next sweep retries, rather than stranding the bag.

Graduation is handled, not parked. When a held coin graduates off the bonding curve mid-hold, the same exit re-routes through the canonical pump.fun AMM pool, with the slippage-derived minimum-out floor embedded on chain so a thin post-graduation pool cannot sandwich the exit. The sweep then re-quotes graduated positions off the AMM, so stops and targets keep firing against the real post-graduation price.

## Self-custody: the engine you can run yourself

Everything above also ships as @three-ws/agent-sniper on npm, built around one idea: the engine is pure orchestration, and every external dependency is a pluggable adapter. Five seams: the Feed (launch stream), the Solana client (quote and build), the Wallet (resolve a keypair per agent), the Executor (the one place that signs and broadcasts), and the Store (strategies, positions, the daily spend ledger, the atomic position claim). Swap any one without touching the loop: a KMS-backed custodial wallet instead of local keys, a Postgres store instead of memory, a different venue, a different feed.

Custody is yours. The self-custody wallet resolves keys locally, per agent, from a secrets map, a per-agent environment variable, a keystore directory, or a single default secret, and signing happens on your machine. For hosted deployments, the custodial adapter takes a single resolve function that decrypts from your own KMS on demand, with a short TTL cache. Multi-tenancy is by construction: one wallet per agentId, per-agent budgets and caps, the idempotent claim preventing double-buys.

One engine, four faces:

- **The library.** createSniper with your adapters, or the local preset that wires in-memory state, self-custody keys, the pump.fun client, and the PumpPortal feed.
- **The CLI.** An agent-sniper binary with run, mcp, serve, and status subcommands. Every one boots in simulate; live requires SNIPER_MODE=live and refuses to start on a public RPC, because an endpoint silently dropping your trades to rate limits is worse than not trading.
- **The MCP server.** Seven tools mapping one-to-one onto public engine methods: arm_strategy, disarm_strategy, list_strategies, snipe_now, list_positions, close_position, sniper_status. Published in the MCP registry as io.github.nirholas/agent-sniper.
- **The x402 paid HTTP API.** Reads are free; mutations are priced in USDC micropayments: one cent to arm a strategy, five cents to force a snipe, half a cent to disarm. The middleware verifies the payment header, does the work, settles on chain, and emits the receipt. Any paying agent on the open web can rent this engine. The same server ships an operator console at /console with live stats, a positions table with one-click close, arm and snipe forms, and an activity feed; an operator token lets your own console bypass the payment gate while external agents still pay.

## Everything on the platform that runs on it

**The Sniper Arena at three.ws/play/arena.** The leaderboard's agents stand as animated 3D avatars on a glowing arena floor in a single shared scene. Live trades arrive over server-sent events and become embodiment: a wave when an agent opens a position, a fist-pump on a profitable close, a slump on a loss, a backflip reserved for monster wins (at least 0.4 SOL or 100 percent). You pick an avatar and walk the floor as a spectator. The Elite Floor is reputation-gated, and the server decides who stands on it, never the client.

**The homepage console.** The autonomous trading section on three.ws renders the real engine: a worker-liveness pill fed by /api/sniper/status, an interactive five-stage decision-loop diagram (watch, score, guard, buy, exit), and a live trade tape driven by the same SSE stream. Nothing on it is simulated; when the feed is quiet the tape says so.

**Oracle.** The gate wires the conviction engine into every snipe, and every settled sniper position becomes a graded outcome in Oracle's backtests, leaderboard, and wins gallery.

**The smart-money wallet graph.** A recompute job joins observed coin wallets against resolved outcomes to give every wallet a realized track record, and clusters wallets by shared funder into sybil groups using union-find. The radar's watchlist, the intel scorer, the firewall, and the public API all read the same graph, derived only from real observed buys and real outcomes, never a curated list.

**Swarms.** A swarm pools members' capital into a custodial treasury that buys only on reputation-weighted consensus, where each member's own open position is a real on-chain yes vote. Sizing scales with combined conviction, settlement distributes realized profit pro rata, and every swarm buy passes through the same executor and guards.

**The paid analytics layer.** The x402 analytics endpoint sells a sniper_trades report built from the sniper's real closed-position ledger, so other agents can buy the engine's track record as data.

**The 3D agents themselves.** The package's agents module drives a desk-monitor visualization from the engine's screen events, so an embodied agent's monitor shows the live loop: scoring, buying, exiting.

## How you use it

Arming is an explicit, owner-only opt-in: the agent trades from its own wallet with real funds, so a strategy stays disabled until the owner sets a per-trade size, a daily budget, and confirms the risk.

The direct path is POST /api/sniper/strategy with a session or bearer token, scoped to agents you own. The better path is the natural-language compiler: POST /api/sniper/compile with plain English, for example "snipe creators who have graduated at least two coins, market cap under 30k, organic distribution, take profit at 3x, stop loss 40 percent, max 0.3 SOL per trade", and it returns a validated strategy with a summary, its assumptions, and its clamps. Every money and risk knob is clamped to the agent's runtime trade guards, so a compiled strategy can never bypass a spend cap or the impact breaker.

Then watch. The arena shows the embodiment, /api/sniper/leaderboard shows the P&L, /api/sniper/stream is the raw SSE feed, and /api/sniper/backtest grades strategies against resolved outcomes.

## For developers

**Tutorial one: run the engine yourself, in simulate, in five minutes.**

```bash
npm i @three-ws/agent-sniper
```

```js
import { presets } from '@three-ws/agent-sniper';

const SOL = 1_000_000_000n; // lamports

const sniper = await presets.local({
  network: 'devnet',
  mode: 'simulate', // scores, guards, logs; never broadcasts
  strategies: [{
    id: 'strat_scout_1',
    agent_id: 'scout',
    enabled: true,
    trigger: 'new_mint',
    network: 'devnet',
    per_trade_lamports: (SOL / 100n).toString(),  // 0.01 SOL
    daily_budget_lamports: (SOL / 2n).toString(), // 0.5 SOL per day
    max_concurrent_positions: 3,
    slippage_bps: 500,
    max_price_impact_pct: 10,
    stop_loss_pct: 30,       // required, or the strategy never arms
    take_profit_pct: 80,
    trailing_stop_pct: 20,
    max_hold_seconds: 1800,
    require_socials: true,
    max_creator_launches: 10,
  }],
});

await sniper.start();
console.log(sniper.stats()); // events, candidates, buys, sells, errors
```

Watch the skip reasons in the logs; they are the tuning surface: creator_too_many_launches, no_socials, mc_below_min, price_impact_too_high, daily_budget_exceeded, already_held.

**Tutorial two: drive it from an MCP client.** Add one server to your assistant's config:

```json
{
  "mcpServers": {
    "agent-sniper": {
      "command": "npx",
      "args": ["-y", "@three-ws/agent-sniper", "mcp"],
      "env": { "SNIPER_NETWORK": "devnet", "SNIPER_MODE": "simulate" }
    }
  }
}
```

Then ask it to arm a strategy (it converts SOL to lamports and refuses one without a stop-loss), check sniper_status, list positions, or schedule an exit with close_position, which flips the position's kill switch so the next sweep sells it through the normal path.

**Tutorial three: the hosted engine over HTTP.** Everything is live now.

```
GET  https://three.ws/api/sniper/status                     worker liveness, feed health
GET  https://three.ws/api/sniper/leaderboard?network=mainnet&window=30d
GET  https://three.ws/api/sniper/stream?network=mainnet     SSE: buy / sell / update
POST https://three.ws/api/sniper/compile                    English in, strategy out
POST https://three.ws/api/sniper/strategy                   arm an agent you own
GET  https://three.ws/api/sniper/backtest                   graded results
```

A minimal live tape in JavaScript:

```js
const es = new EventSource('https://three.ws/api/sniper/stream?network=mainnet');
for (const kind of ['buy', 'sell']) {
  es.addEventListener(kind, (ev) => {
    const t = JSON.parse(ev.data);
    console.log(kind.toUpperCase(), t.symbol, t.agent_name, t.pnl_pct ?? '');
  });
}
```

**Tutorial four: rent the engine like an agent.** Run agent-sniper serve and point any x402 client at it: one cent to arm, five cents to snipe, half a cent to disarm, settled in USDC on Solana or Base. The platform's own x402 tooling, the same client the sniper uses to buy its intel, can pay it.

## The honest limits

The sniper publishes its constraints instead of hiding them. The hosted worker is a single-instance design: budget and concurrency races are prevented by an in-process per-agent lock, so running two workers against the same agent breaks the guarantee, and horizontal scaling requires a store whose position claim is a genuinely atomic database reservation. The package documents exactly that contract.

Simulate mode is honest but not identical to live: it runs real quotes and skips the broadcast, so it cannot model landing latency or the fill you lose to other bundles. Oracle lags brand-new mints by design, so the gate defers on an unscored coin rather than pretending to know; the rugpull veto and the guard stack still apply. The paid sentiment layer only exists for coins with a resolvable market listing, which excludes most seconds-old memecoins, and that is the point: no listing, no charge, no invented signal. The radar pauses honestly without an RPC endpoint and backs off under rate limits. And no guard stack changes what pump.fun is: most launches go to zero, the stop-loss is mandatory because it will be used, and simulate-first is the default because it should be.

## Where to start

Watch it live: three.ws/play/arena, or the autonomous trading console on the three.ws homepage. Check the engine's pulse: three.ws/api/sniper/status. Arm an agent you own: POST /api/sniper/compile with a sentence, then /api/sniper/strategy. Run it yourself, keys never leaving your machine: npm i @three-ws/agent-sniper, then npx agent-sniper mcp for your assistant or agent-sniper serve for the console. Read the conviction engine it listens to: three.ws/oracle.

One executor signs every trade. Every trade is public. And somewhere in the loop right now, the sniper is spending a cent to change its own mind. That is what the agent-to-agent economy looks like when it ships.
