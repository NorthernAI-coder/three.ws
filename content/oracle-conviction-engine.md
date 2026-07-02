# Oracle: one honest number for every pump.fun launch

*Long-form X article. How three.ws fuses who is buying, how a coin is built, what it is, and how it is moving into a single live conviction score, and how your 3D agent acts on it. $THREE is the only coin.*

The first minutes of a new coin are the most asymmetric market on earth. Insiders know the creator's history, which wallets are loading up, and whether the supply is clean. You see a ticker and a green candle. By the time the answer is obvious, the trade is gone.

Oracle is our answer to that. It watches every pump.fun launch, scores it from 0 to 100, and publishes the score, the reasoning, and the track record in public. One honest number, live at [three.ws/oracle](https://three.ws/oracle).

## The four pillars

Every score fuses four independent reads on a coin. Each pillar is scored on its own, then combined, so you can always see why a coin scored what it did.

**WHO, the Pedigree pillar.** Reputation earned on chain. Which smart wallets are in this coin, and what is the creator's launch history? Oracle keeps a ledger of wallets that have proven they win, and a cold start prior for creators it has never seen, so a first launch is treated with honest uncertainty instead of fake confidence.

**HOW, the Structure pillar.** The engineering of the launch itself. Holder distribution, top holder concentration, bundling, mint and freeze authority, mutable metadata. A coin with structural red flags gets capped no matter how good everything else looks. Rugs are a structure problem before they are a price problem.

**WHAT, the Narrative pillar.** What the coin actually is. Oracle classifies every launch into a category and scores it with a model that has the news on its desk, so a coin riding a real, current narrative reads differently from one riding nothing.

**MOVE, the Momentum pillar.** How it is trading right now. Deliberately the lightest pillar, because momentum is the easiest signal to fake and the last to matter.

## Tiers, and why the ladder is strict

The fused score maps to a tier: prime, strong, lean, watch, or avoid. The ladder is conservative by design. Only prime and strong are act signals. Lean means watch for confirmation. Watch means no edge yet. Avoid means pedigree or structure red flags, full stop.

Most launches never get past watch. That is the point. A conviction engine that likes everything is a hype engine.

## The part built for agents

Humans read the coin page. Agents read the signal endpoint.

```
GET three.ws/api/oracle/signal?network=mainnet&min_score=72&limit=5
GET three.ws/api/oracle/signal?mint=<mint>
```

It returns the current highest conviction plays, or a single coin's verdict, with an explicit machine readable recommendation: an action (buy, watch, or skip), a confidence level, and a suggested size factor. Prime maps to full size, strong to three quarters, everything else to zero. Your agent does not have to re-implement the decision rules to know what to do.

This is what powers the agent action loop. Arm your 3D agent at [three.ws/oracle/arm](https://three.ws/oracle/arm), set it to simulate or live, and it polls the signal, acts only on prime and strong, and narrates what it did and why. Every decision it makes shows up in real time at [three.ws/activity](https://three.ws/activity).

## Receipts, in public

A score you cannot audit is an opinion. Oracle publishes its evidence.

The calibration and backtest pages show what win actually means, how often each tier delivers, and how the thresholds were set. Every scored coin is graded after the fact, so the tier ladder is accountable to outcomes, not vibes. The whole data loop, from the pump.fun firehose to the scoring worker, is watchable live at [three.ws/pipeline](https://three.ws/pipeline).

If the engine is wrong, you will see it be wrong. That is the deal.

## The full market picture

Conviction tells you whether to trust a launch. It deliberately says nothing about price. So every Oracle coin page now carries a live market intel aggregator that fans out to six real sources in parallel: DexScreener, the pump.fun API, GeckoTerminal, GoPlus, Birdeye, and CoinGecko. Price, liquidity, FDV, bonding curve progress, holder count, top ten concentration, and the security posture of the mint, all fused into one view, every number traced to a live upstream.

Each source is isolated. If one is down or rate limited, that slice degrades to null and the rest of the page stays live. No mocks, no cached theater.

## Why it compounds

Every coin Oracle watches makes the next score sharper. Every graded outcome tunes the calibration. Every proven wallet added to the pedigree ledger makes WHO harder to fool. The engine is a flywheel: more coverage, better priors, sharper scores, more graded outcomes, better calibration.

That is the bet. Not a hot take generator, but a scoring engine that gets harder to beat every day it runs.

## Where to start

Read the feed at [three.ws/oracle](https://three.ws/oracle). Read the full reference, from the thesis to the exact pillar math to the API, at [three.ws/oracle/docs](https://three.ws/oracle/docs). Then arm your agent at [three.ws/oracle/arm](https://three.ws/oracle/arm) and let it trade conviction instead of noise.

The more data we watch, the sharper every score. Oracle is live now.
