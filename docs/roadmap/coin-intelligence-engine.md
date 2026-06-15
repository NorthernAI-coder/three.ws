# Coin Intelligence Engine

**Status:** Building (foundation landing now). Last updated 2026-06-15.
**Purpose:** Watch, record, and classify **every** coin launched on pump.fun in real time, derive the signals that separate organic launches from bundles/rugs, and serve that intelligence to user agents in milliseconds so they can act faster than a human ever could.

The autonomous sniper ([workers/agent-sniper/](../../workers/agent-sniper/)) currently scores a coin from **only its mint-creation event** — name, socials, creator history, initial buy. That's a snapshot. This engine adds the missing dimension: **what happens in the first seconds of trading**, which is where bundles, sniper swarms, dev dumps, and organic demand actually reveal themselves.

---

## What it watches (every metric)

For each new mint, the watcher subscribes to its live trade stream (PumpPortal `subscribeTokenTrade`) for an observation window (default 90s) and records:

**Per coin**
- Dev (creator) initial buy size, and whether the dev sold inside the window (dev dump).
- Every buy and every sell: trader wallet, SOL size, token amount, timestamp.
- Buy/sell counts, buy/sell volume, net flow, trade velocity over time.
- Largest single buy, average + median buy size, buy-size distribution.
- Unique buyers, unique sellers, unique traders, buyer/seller ratio.

**Derived signals** (see [signals.js](../../workers/agent-sniper/intel/signals.js))
- **Bundle score** — burst of near-identical buys clustered at launch from many distinct wallets = coordinated bundle, not organic demand.
- **Snipe ratio** — fraction of buy volume that landed in the first few seconds.
- **Organic score** — buyer diversity + arrival-time spread (entropy) + healthy size distribution + dev not dumping.
- **Coordination score** — the inverse: clustering + identical amounts + (when available) a shared funding wallet.
- **Concentration** — top-wallet / top-5 / top-10 share of net buying (whale capture).
- **Fresh-wallet ratio** & **bubblemap connectivity** — when wallet-graph enrichment is available (RPC funder lookup), the share of top buyers funded from a common source. Honest by design: left `null`, never faked, when enrichment is off.
- **Risk flags** — `bundle_launch`, `dev_dumped`, `single_whale`, `low_diversity`, `fresh_wallet_swarm`, `sell_pressure`.
- **Quality score (0–100)** — a composite the agent reads at a glance.

**Classification** (see [classify.js](../../workers/agent-sniper/intel/classify.js))
- Category: `meme | tech | ai | culture | community | political | news | animal | celebrity | utility | unknown`.
- Is it a news-story meme? Tags, narrative, a one-line thesis, and a confidence.
- LLM-driven (free-first via `llmComplete`), with a deterministic keyword classifier as an always-on fallback so it **never fails** (Rule 9).

---

## How it learns

Watching isn't enough — the engine closes the loop:

1. **Outcome labeling** (`pump_coin_outcomes`) — minutes/hours later, each watched coin is revisited: did it graduate? what ATH multiple? did it rug (price → ~0)? This is the ground truth.
2. **Weight learning** ([learn.js](../../workers/agent-sniper/intel/learn.js)) — periodically correlate launch-time signals with outcomes and compute per-signal predictive weights, stored in `pump_intel_weights`.
3. **The scorer reads the weights** — so the sniper's judgment improves as the dataset grows. A signal that historically preceded rugs gets down-weighted automatically; one that preceded graduations gets up-weighted. The platform gets smarter the more coins it watches.

---

## How agents read it (fast)

- **In-memory cache** in the worker ([store.js](../../workers/agent-sniper/intel/store.js)) — the sniper reads intel for a mint with zero I/O on the hot path.
- **`GET /api/pump/coin-intel?mint=…`** — any agent (user-built, MCP, external) reads the full intel record. `GET /api/pump/coin-intel` returns the live radar feed.
- **Scorer integration** — `scoreMint(mint, strat, intel)` applies intel vetoes (e.g. confirmed bundle launch) and weighted soft-scoring before a buy.

---

## Data model

| Table | Holds |
|---|---|
| `pump_coin_intel` | One row per observed coin: raw aggregates, derived signals (JSONB), classification, quality score. |
| `pump_coin_wallets` | Per-coin per-wallet aggregate: buy/sell SOL, trade count, net, first/last seen — the "who traded it" ledger and the basis for concentration + bubblemap. |
| `pump_coin_outcomes` | Ground-truth outcome per coin (graduated / ath_mult / rugged), labeled after the fact. |
| `pump_intel_weights` | Learned per-signal weights the scorer reads. |

All SOL stored as lamports (`numeric(40,0)`) to match the rest of the sniper schema.

---

## Honesty rules baked in (Rule 1 & 9)

- No metric is ever invented. Wallet-graph/fresh-wallet signals are `null` when enrichment is off — never a placeholder number.
- Classification always returns *something* (heuristic fallback) so the pipeline can't stall on an LLM outage.
- Every number traces to a real on-chain trade we observed, persisted in `pump_coin_wallets`.

---

## Build order

1. ✅ Schema, signals, classifier, store, watcher, learning, scorer wiring, serving API, tests. *(foundation)*
2. Wallet-graph enrichment via RPC funder lookup (turns `bubblemap connectivity` from `null` → live).
3. The `/radar` UI — live coin intelligence feed.
4. Backfill outcome labeler cron + first learned-weights pass once enough coins are observed.
5. MCP tool `pump_coin_intel` so external agents read the same intelligence.
