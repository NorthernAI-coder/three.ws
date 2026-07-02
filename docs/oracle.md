# Oracle — the conviction engine, end to end

> **Documentation · living reference** — Updated 2026-06-30 · ~35 min read · Plain-English throughout, with deep dives for the math.

Oracle reads every **pump.fun** launch the moment it appears and answers one question: **how much conviction does the on-chain evidence actually support?** It fuses four independent reads — **who** is buying, **how** the launch is structured, **what** story it rides, and **how** it is moving — into a single transparent **0–100 score**, then lets your 3D agent act on the plays that clear your bar. This is the complete reference: the thesis, the exact math, the data, the evidence, the API, the limits, and where it goes next.

- Open the live Oracle → [three.ws/oracle](https://three.ws/oracle)
- Arm an agent → [three.ws/oracle/arm](https://three.ws/oracle/arm)

**The live surface.** Every launch in the last 12 hours, scored and ranked, with a live conviction-breadth bar and per-narrative averages.

---

## How to read this

These docs are written in two layers so the same page serves a curious first-timer and a quant who wants the closed form.

- **Plain — the body text.** Every section opens in plain English: what it is, why it exists, and how to use it. If you only read the prose, you will understand the whole system and never see a formula you didn't ask for.
- **Deep dive — the disclosures.** Anything labelled **Deep dive** expands into the exact math, constants, code paths, and edge cases — the researcher's layer.

> **Conventions.** Numbers and thresholds quoted here are the **real production constants** from the engine. Tier names are `prime · strong · lean · watch · avoid`. Pillars are nicknamed **WHO** (pedigree), **HOW** (structure), **WHAT** (narrative), **MOVE** (momentum) throughout the product and these docs.

---

## Quickstart

Three ways in, depending on what you want from Oracle today.

- **For traders — Read a score.** Open the feed, sort by conviction, click any coin. The drawer shows the four pillars and a plain-English reason for every point. A high score is an argument, not a promise — read the reasons.
- **For skeptics — See the proof.** Go straight to *The edge*. Win rate by tier with 95% confidence bands, a calibration ladder, and a Brier score — shown even when the edge is thin. Proof, not promises.
- **For builders — Arm an agent.** Point a 3D agent at the conviction stream, set your bar and caps, and let it act — in **simulate** mode for free, or **live** with hard spend limits. Every action is graded against the outcome.

Prefer to integrate? Every number on the page is a public endpoint — jump to the [API reference](#api-reference). Agents can poll `/api/oracle/signal` for a machine-ready buy/watch/skip recommendation.

---

## The thesis

pump.fun mints thousands of tokens a day. Almost all go to zero. The few that run, run violently. The entire game is a signal-extraction problem under extreme time pressure — and the edge is not a secret indicator, it is **coverage**.

### The problem: asymmetric information at the speed of a block

When a coin launches, the people who win are the ones who already know things you can't see fast enough: **whose wallets are buying** (and whether those wallets have a track record or a rug history), **whether the launch is organic or a coordinated bundle**, **whether the "community" is 200 real people or 200 freshly-funded burner wallets**, and **whether the story has cultural legs**. By the time a human reads a chart, the asymmetry has already paid out.

Every one of those facts is on-chain or one inference away from it. The bottleneck has never been availability — it is **assembly and speed**. No human watches every wallet across every launch and fuses it into a decision in seconds. A machine can.

### The bet: fuse full-coverage data into one honest number

Oracle's wager is that a transparent, calibrated fusion of **who / how / what / move** beats both gut instinct and any single indicator, because the failure modes are independent. A great story (WHAT) cannot save a launch where the dev already sold (HOW). A pile of smart-money wallets (WHO) means little if they are already trimming (also WHO). Fusing independent reads cancels noise and surfaces the rare launch where *every* axis agrees.

Two design commitments make that bet honest:

- **Transparency over magic.** Every score ships with the reasons that built it. There is no opaque model output you are asked to trust — you can read why a coin earned an 82 or got capped at 46.
- **Proof over promises.** Every verdict is checked against ground truth — did it graduate, rug, or run — and the realized win rate, with confidence bands, is published on the page. When the edge is thin, the page says so.

### Why it compounds

The system gets sharper the more it watches, on two flywheels. The **data flywheel**: every resolved outcome updates the wallet-reputation graph that powers the WHO pillar, so the definition of "smart money" is continuously re-earned, never hard-coded. The **calibration flywheel**: every graded outcome tightens the backtest, exposing exactly where the score is over- or under-confident so the model can be re-weighted against reality rather than intuition.

> **The one-sentence version.** Oracle turns the full on-chain footprint of a launch into one transparent, continuously-calibrated conviction score — and then lets an agent act on it within hard limits, grading itself against the outcome every time.

---

## The system at a glance

Oracle is a thin, fast conviction layer on top of a full-coverage pump.fun data brain. It does not re-ingest the chain — it reads the brain's tables, adds two things the brain doesn't have (cultural narrative and an action loop), and closes the loop against outcomes.

### The closed loop — launch to verdict to action to learning

```
pump.fun            → Every new launch + its on-chain trades.
  ↓
Intel tables        → Wallets, structure signals, reputation, outcomes.  (Brain)
  ↓
Assemble + classify → Fuse intel; LLM narrative w/ live news.            (Oracle)
  ↓
Convict             → Four pillars → one 0–100 score + tier.             (Oracle)
  ↓
Feed / stream / API → Live to humans and agents.                        (Surface)
  ↓
Agent loop          → Armed agents buy within caps.                     (Act)
  ↓
Settle + backtest   → Grade vs outcome; recalibrate.                    (Learn)
```

The platform splits into three cooperating parts:

- **Read path — the conviction library.** A pure, side-effect-free scoring function (`convict()`) plus a defensive data-assembly layer. Given a mint, it returns a score, tier, pillar breakdown, and reasons. No I/O during scoring — fully testable.
- **Run path — the worker.** A long-lived Node process running three independent loops — **score** (keep verdicts warm), **agent** (act on armed watches), and **settle** (grade outcomes) — each self-scheduling so a slow pass never blocks a fast one.
- **Edge path — the API + UI.** ~24 endpoints (JSON + SSE) serving the feed, coin detail, wallet intel, backtest, streams, and the agent-config surface. Cached at the CDN; rate-limited per IP.

> **Design principle.** The scoring is a **pure function of assembled intel**. Everything stateful — ingestion, persistence, execution, settlement — lives outside it. That boundary is why the math is testable, the verdicts are reproducible, and the same engine powers the live feed, the API, and an agent's decision with identical results.

---

## The four pillars

Conviction is the weighted fusion of four independent reads. Each pillar is scored 0–100 on its own, for its own reasons, and contributes a fixed share of the final number.

### Pillar weights — what moves the final score

| Pillar | Weight | Why |
|---|---|---|
| **WHO · Pedigree** | 0.34 | Buyer track record is the single most predictive signal. |
| **HOW · Structure** | 0.30 | The fair-launch guardrail; also imposes hard ceilings. |
| **WHAT · Narrative** | 0.18 | Cultural strength; a tie-breaker, not a savior. |
| **MOVE · Momentum** | 0.18 | Is real buying pressure actually showing up? |

WHO and HOW together carry nearly two-thirds of the weight because **who is buying** and **how fair the launch is** are the two facts that most reliably separate runners from rugs. WHAT and MOVE are lighter — they break ties and confirm, but a good story or a green first minute can't rescue a coin the harder pillars condemn.

### ① WHO — Pedigree

**The question:** who is already in this coin, and what is their record? Pedigree rewards launches where wallets with a *proven* history of getting into winners early are already buying — and penalizes the presence of known ruggers, dumpers, and serial failed-launch creators.

**Plain-English drivers:** more proven wallets in is better; a large share of the buy volume coming from proven money is better; a creator who has shipped graduated launches before is better. Conversely, flagged wallets, smart money already *selling*, and a creator with a rug pattern all cut the score — and a serial rugger **caps** it outright.

<details>
<summary><b>Deep dive — Pedigree: exact rules & constants</b></summary>

Inputs come from the brain's smart-money slice (a pre-computed 0–100 composite, proven/total buy & sell lamports, a list of notable wallets with labels) and the creator's record (label, prior launches, graduated launches, dump rate). The base is the brain's composite, or the average of notable wallets' scores if the composite is absent.

| Signal | Adjustment | Note |
|---|---|---|
| ≥5 proven wallets in | **+14** | +9 at ≥3, +5 at ≥1 |
| Proven share of buy vol ≥40% | **+8** | +4 at ≥20% |
| Flagged wallet present (rugger/dumper) | **−12** each | capped at −36 (3 wallets) |
| Smart money sold ≥50% of position | **−16** | −8 at ≥25% (trimming) |
| Creator: ≥3 launches, 0 graduated | **−22**, cap ≤45 | rug pattern → hard ceiling |
| Creator: ≥3 graduated launches | **+12** | +6 at ≥1 |
| Creator dumps ≥50% of launches | **−8** | consistent exit pattern |

Returns `{ score, reasons[], cap }`. The `cap` is a hard ceiling on the *final* fused score — the mechanism by which a serial rugger can never produce a "prime" coin no matter how good the other pillars look. A wallet counts as "proven" if it is labelled `smart_money`/`kol` or carries a reputation score ≥70.

</details>

### ② HOW — Structure

**The question:** is this a fair launch or an engineered one? Structure is the guardrail. It reads the distribution and timing of the launch — bundle likelihood, holder concentration, snipe pressure, fresh-wallet farming, single-funder clusters, dev selling — and rewards broad, organic bases while punishing coordination and concentration.

**Plain-English drivers:** many unique early buyers and low concentration push the score up. Bundles, a top wallet holding half the supply, 70% of volume sniped in the first seconds, armies of freshly-funded wallets, or a dev who already sold all push it down — and the worst of these **cap** the whole coin in the 38–55 range regardless of pedigree.

<details>
<summary><b>Deep dive — Structure: exact rules & the cap mechanism</b></summary>

The base is anchored to the brain's organic-demand score: `base = 30 + organic·0.55` (so structure alone lives in ~30–85), or a neutral 62 when organic isn't available. Then a battery of red-flag checks subtract and, for the severe ones, set a hard ceiling.

| Signal | Adjustment | Cap |
|---|---|---|
| Bundle likelihood ≥60% (≥35%) | −20 (−11) | ≤46 |
| Top-10 wallets hold ≥80% (≥60%) | −22 (−12) | ≤44 |
| Buyer interconnectivity ≥60% | −10 | ≤55 |
| Snipe ratio ≥70% (≥45%) | −16 (−8) | ≤50 |
| Fresh/farmed wallets ≥70% (≥45%) | −18 (−9) | ≤48 |
| ≥60 unique buyers (≥25 / <8) | +16 (+9 / −8) | — |
| Top holder ≥50% (≥30%) | −26 (−14) | ≤45 |
| Creator still holds ≥25% | −16 | — |
| Dev sold ≥50% (≥20%) | −24 (−10) | ≤38 |
| Single-funder cluster ≥50% (≥30%) | −22 (−12) | ≤42 |
| Explicit bundle risk flag | −18 | ≤48 |

The lowest cap triggered wins. This is the formal statement of "structure is a veto": a launch with a serious structural defect is ceiling-limited *before* the weighted average is taken, so no amount of pedigree or narrative lifts it into a high tier.

</details>

### ③ WHAT — Narrative

**The question:** what is this coin about, and does the story have cultural legs? Narrative classifies the launch into one of eleven categories (meme, ai, culture, news, animal, celebrity, political, community, tech, utility, unknown) and estimates its virality — preferentially with a language model that is given **live crypto headlines** so it can recognize a coin riding today's news.

**Plain-English drivers:** each category carries a prior (how durable that kind of story tends to be), and the model's virality estimate is blended with that prior, weighted by the model's own confidence. A confidently-viral culture coin scores high; an unclassifiable one is treated with caution. It's the lightest pillar on purpose — a story is a multiplier on a real launch, not a substitute for one.

<details>
<summary><b>Deep dive — Narrative: priors, blending, and the classifier chain</b></summary>

**Category priors** (base virality): `news 70 · culture 66 · ai 64 · meme 60 · animal 56 · community 58 · celebrity 54 · political 52 · tech 50 · utility 46 · unknown 40`.

**Blending** when a virality estimate exists:

```
score = virality · (0.4 + 0.4·confidence) + prior · (0.6 − 0.4·confidence)
```

So high model confidence leans on the virality estimate; low confidence falls back toward the category prior. With no estimate, `score = prior`. A `news` coin adds the reason "fast but fragile"; an `unknown` coin adds "treat with caution."

**Classifier chain** (preference order): (1) LLM with live headlines from a public crypto-news API — fuzzy-matched against the coin's name/symbol/tags, contributing up to +30 virality when the coin clearly rides a current story; (2) LLM without news context; (3) a deterministic keyword classifier with per-category lexicons and a social-presence virality heuristic. The chain degrades gracefully — if the model is unavailable, the heuristic always produces a usable classification, tagged `source: heuristic` vs `llm`. A separate social-ingestion path can additively boost virality from tweet engagement, but never downgrades an LLM classification.

</details>

### ④ MOVE — Momentum

**The question:** is real buying pressure actually showing up, right now? Momentum reads the earliest footprint — the buy/sell balance, how fast unique buyers are piling in, and the size of the dev's own buy as a tell.

**Plain-English drivers:** buyers strongly outnumbering sellers, a rapid pile-in of unique early buyers, and a dev who put a *sensible* amount of skin in the game all lift the score. Heavy early selling cuts it, and an *oversized* dev buy is read as a honeypot risk and penalized.

<details>
<summary><b>Deep dive — Momentum: exact rules</b></summary>

Starts at a neutral 50.

| Signal | Adjustment |
|---|---|
| Buy share ≥80% & ≥10 buys | **+22** (strong inflow) |
| Buy share ≥65% | +12 (buyers outnumber sellers) |
| Buy share <45% | −16 (distribution) |
| ≥40 early buyers (≥15) | +14 (+7) — pile-in |
| Dev buy 0.2–2.5 SOL | +8 (skin in the game) |
| Dev buy >6 SOL | −14 (oversized → honeypot risk) |

With no signal yet it returns "too early," keeping the pillar neutral rather than inventing momentum that isn't there.

</details>

---

## Fusion & tiers

The four pillar scores collapse into one number by a weighted average — then the structural and pedigree caps clamp it down, it rounds, and it lands in a tier.

```
# weighted average of the four pillar scores
score = WHO·0.34 + HOW·0.30 + WHAT·0.18 + MOVE·0.18

# structure (and pedigree) can veto — the lowest cap wins
score = min(score, structure.cap)

# round + clamp to the 0–100 integer line
score = clamp(round(score), 0, 100)
```

The cap step is the whole philosophy in one line: pillars *add up*, but a serious red flag in HOW (or a rugger creator in WHO) sets a ceiling the average cannot exceed. A coin with stellar pedigree and a bundle flag does not average out to "pretty good" — it is capped at ~46 and lands in **watch**, exactly where it belongs.

### The tier ladder

The final integer maps to one of five tiers. Tiers are how humans skim the feed and how agents set a bar.

| Tier | Range | Meaning |
|---|---|---|
| **Prime** | 86–100 | Every axis agrees; rare. |
| **Strong** | 72–85 | Favorable across the hard pillars. |
| **Lean** | 56–71 | Leaning positive, inconclusive. |
| **Watch** | 34–55 | Mixed signals. |
| **Avoid** | 0–33 | Structural red flags. |

Alongside the score, the engine emits **badges** (e.g. `smart-money`, `structure-flag`, `news`, `momentum`, `prime`) for fast visual scanning, and an ordered list of **reasons** — each tagged to the pillar that produced it — so the score is never a black box.

> **Read the reasons, not just the number.** Two coins can both score 70 for completely different reasons — one on pure pedigree with weak momentum, another on a viral narrative over a thin base. The tier tells you *how strong*; the reasons tell you *why*, and the why is what you trade on.

---

## Anatomy of a score

The coin drawer the product shows when you click any launch is the score, fully unpacked — the same object the API returns, rendered for a human.

**One verdict, fully unpacked.** Example: Conviction **35** (watch): the WHO/HOW/WHAT/MOVE pillars across the top, a plain-English **"why this score"** list, the structure read (organic-buy vs bundle), the **who's-in** wallet roster, and a live trade tape — all for a single launch.

Walking the drawer top to bottom mirrors the model exactly:

- **The four pillar bars** — WHO / HOW / WHAT / MOVE — are the sub-scores from the section above. The big number is their capped, weighted fusion.
- **"Why this score"** is the `reasons[]` array, each line tagged to the pillar that generated it. In this example: "no proven wallets identified yet" (WHO), "clean, distributed launch structure" (HOW), "meme narrative, virality 45/100" (WHAT), "no clear momentum yet — too early" (MOVE). A clean-but-unproven young launch — correctly a **watch**, not an avoid and not a buy.
- **Structure / wallet-graph / buy-pattern** expose the raw HOW inputs (organic-buy %, bundle %, the funder graph) so you can audit the guardrail.
- **Who's-in** is the live pedigree roster — every notable wallet, its label, and its track record.
- **Live trades** streams the coin's buys and sells in real time, each annotated with the trader's wallet archetype.

Every field here is also available programmatically from `GET /api/oracle/coin?mint=…` — see the [API reference](#api-reference).

---

## Data & ingestion

Oracle reads from a separate full-coverage data brain rather than touching the chain itself. The brain ingests pump.fun and maintains the reputation graph; Oracle assembles, classifies, and fuses. The separation is what keeps scoring a pure, fast function.

### What the brain provides (read-only)

Five brain tables feed every score. Oracle queries each one **defensively** — a missing or younger table degrades the affected pillar gracefully rather than failing the whole verdict.

| Brain table | Feeds | Key columns Oracle reads |
|---|---|---|
| `pump_coin_intel` | HOW, WHAT, metadata | symbol, name, image, category, creator, bundle_score, organic_score, snipe_ratio, fresh_wallet_ratio, concentration_top10, bubblemap_connectivity, risk_flags, buy/sell counts, dev buy/sold |
| `coin_smart_money` | WHO (base) | smart_money_score, smart_wallet_count, proven/total buy lamports, notable[] |
| `pump_coin_wallets` | WHO, HOW | per-wallet buy/sell lamports, is_creator, funder (cluster source) |
| `wallet_reputation` | WHO (labels) | label, smart_money_score, win_rate, early_win_rate, dump_rate, coins_traded, creator_count, creator_wins |
| `pump_coin_outcomes` | Evidence, settlement | graduated, rugged, ath_multiple, last_market_cap_usd |

### Narrative: a model with the news on its desk

The WHAT pillar is the only place Oracle reaches outside the brain. To classify a launch's story, it fetches **live crypto headlines** from a public news API (cached ~90s), injects them into the language model's prompt, and asks for a category, a one-line narrative, a virality estimate, and a confidence. A coin literally riding today's headline gets recognized as such and scored higher. If the model is unavailable, a deterministic keyword classifier takes over so a verdict always ships.

### Pedigree: reputation earned, with a cold-start prior

"Smart money" is not a hard-coded list — it is continuously re-earned from outcomes in the `wallet_reputation` graph. For wallets the brain hasn't judged yet, Oracle seeds a **cold-start prior** from a curated known-wallet set (sourced from public KOL/wallet intelligence), so a brand-new coin still gets a useful pedigree read on its first scoring pass. Precedence is always **earned reputation > prior > unproven**.

<details>
<summary><b>Deep dive — Oracle's own tables & data lifecycle</b></summary>

Oracle owns five tables: `oracle_narrative` (classified story + virality), `oracle_conviction` (the live verdict cache, one row per mint), `oracle_conviction_history` (score time-series, written only on a ≥3-point change, 72h retention), `oracle_agent_watch` (armed-agent config), and `oracle_watch_actions` (the action ledger). Full columns in the [data model](#data-model).

Lifecycle: a coin must be first-seen and within a 12h window to enter scoring; it's scored, classified, and cached; rescored when stale (every ~3 min if new data arrives); its history appended on material change; quote/stablecoin mints (USDC, wSOL, …) are excluded and purged. Nothing about a score decays purely with time — the engine is event-driven, reacting to new wallet activity, not a clock.

</details>

---

## The worker

A single long-lived Node process runs three independent, self-scheduling loops. They share nothing but the database, so a slow scoring pass never delays an agent acting, and a stuck confirmation never freezes scoring.

- **Score loop** — *every ~15s · batch 20.* Finds recent launches that are new or stale (last scored >3 min ago), scores each — assemble → classify → fuse → persist — and appends history on material change. Keeps the cache warm.
- **Agent loop** — *every ~3s.* For each armed watch, evaluates freshly-scored coins against the agent's bar and budget, executes a buy when the gates pass, and fires alerts. Dedups so an agent never acts twice on one coin.
- **Settle loop** — *every ~60s · batch 100.* Finds open actions whose coin now has a resolved outcome, grades each win/loss/flat, marks PnL to market, and closes the learning loop.

### Cold start & graceful degradation

If the conviction cache is empty (fresh deploy), the feed endpoint scores a handful of recent coins on the spot — database-only, no LLM — so the UI is never blank while the score loop catches up. Every brain query is wrapped so a missing table yields a null slice, not a crashed pass.

<details>
<summary><b>Deep dive — Configuration, safeguards & the kill switch</b></summary>

The worker is configured entirely by environment. Selected knobs (with defaults): `ORACLE_MODE=simulate`, `ORACLE_NETWORK=mainnet`, `ORACLE_SCORE_INTERVAL_MS=15000`, `ORACLE_AGENT_INTERVAL_MS=3000`, `ORACLE_SETTLE_INTERVAL_MS=60000`, `ORACLE_SCORE_BATCH=20`, `ORACLE_RESCORE_AFTER_SEC=180`, `ORACLE_MAX_TRADE_SOL=0.25` (absolute per-trade ceiling), and `ORACLE_GLOBAL_KILL=1` (halts all agent + settle activity while scoring continues). Live mode additionally requires the secret used to decrypt agent wallets, and refuses to start without it.

Operational safeguards layer up: a global kill switch, a hard per-trade SOL cap enforced in the executor (independent of any per-agent setting), per-watch daily-spend and open-position caps, a 60-second confirmation timeout so stuck transactions don't block the loop, and a 60-second cache on decrypted keypairs to bound decryption overhead during bursts. **Simulate is the default** — the worker logs realistic actions with zero spend unless explicitly switched to live.

</details>

---

## The agent action loop

Conviction is only half the product. The other half is letting a 3D agent **act** on it — autonomously, within limits you set, grading itself against every outcome. That is what [/oracle/arm](https://three.ws/oracle/arm) configures.

**Arm your agent.** Pick an agent, set the bar (Prime / Strong+ / Lean+), the position size and caps, optional narrative filters and Telegram alerts, then arm in **simulate** or **live**. A live preview shows exactly which coins would clear your rules right now.

### How a decision is made

For every armed agent, on every freshly-scored coin, a pure decision function runs a sequence of gates. If any gate blocks, the agent passes; if all clear, it sizes and buys.

| Gate | Blocks when… |
|---|---|
| Armed | the watch isn't armed |
| Min score / tier | conviction below the agent's bar |
| Narrative filter | category not in the agent's allow-list (if set) |
| Require smart money | no proven wallet is in yet (if required) |
| Max open positions | the agent is already at its concurrency cap |
| Daily budget | this buy would exceed the 24h spend cap |

Position size is the agent's base per-trade amount, optionally **scaled by conviction** — up to 1.5× as the score climbs from the agent's minimum toward 100 — so the agent leans harder into the strongest plays without ever exceeding its caps.

### Simulate vs live

**Simulate** (the default) logs a realistic action — same gates, same sizing, same grading — but spends nothing, so an agent can build a verifiable paper track record before a cent is at risk. **Live** decrypts the agent's wallet, builds a pump.fun buy with slippage protection, optionally routes through a Jito bundle for MEV protection, confirms on-chain, and records the signature. Both paths write to the same ledger and are graded identically by the settle loop.

<details>
<summary><b>Deep dive — The executor: sizing, Jito routing, hard caps</b></summary>

Conviction-weighted size: `size = base · (1 + clamp((score − min)/(100 − min), 0, 1)·0.5)`. The executor then applies the absolute ceiling: `size = min(size, ORACLE_MAX_TRADE_SOL)` — a guardian limit that overrides any per-agent setting.

Live routing builds buy instructions via the pump SDK with 10% slippage, fetches a fresh blockhash, and either sends a raw transaction (skip-preflight off, up to 3 retries, 60s confirm race) or, when Jito is enabled, prepends a small tip transfer to a rotating tip account and submits the pair as a bundle to the block-engine endpoint. The action is written as `filled` with the signature (or `jito:<bundleId>`), `skipped` if the agent has no wallet, or `failed` on any on-chain error — never silently dropped.

</details>

---

## Calibration & backtest

A conviction score is a probabilistic claim, and a probabilistic claim is worthless unless it's checked against reality. Oracle joins every verdict to its ground-truth outcome and publishes the result on the page — including when the edge is thin. This is the part that separates a model from a vibe.

**Proof, not promises.** Win rate by tier with **95% confidence bands**, and a calibration ladder plotting *realized* win rate against what each score band *predicts*. The live edge tab shows a weak edge as readily as a strong one — no cherry-picking.

### What "win" means

A scored coin is a **win** if it graduated or reached a ≥2× ATH multiple; a **loss** if it rugged or languished below 1.2×; **flat** in between. Only resolved coins count toward a win rate — open positions are excluded, so the number can't be inflated by undecided bets.

### The four things the backtest publishes

- **Win rate by tier, with honest error bars.** Each tier's realized win rate is shown with a **95% Wilson confidence interval** — the right tool for win-rate estimates on small samples, where a naïve ± would lie. A wide band means "not enough data yet," and the page says so.
- **Calibration ladder.** Coins are bucketed by score (0–10, …, 90–100) and each bucket's *realized* win rate is compared to the score it *predicts*. A calibrated engine keeps realized near predicted and climbing band-over-band.
- **Brier score.** One number for overall calibration error — the mean squared error of (score/100) against the binary outcome. Lower is better; 0 is perfect, 0.25 is a coin flip.
- **Edge multiple & monotonicity.** Does prime actually beat blind buying? The page reports prime's win rate, the lift over the base rate, the edge multiple, and whether win rate rises monotonically across tiers.

<details>
<summary><b>Deep dive — The Wilson interval & why we use it</b></summary>

For `w` wins in `n` resolved coins, the 95% Wilson score interval (z = 1.96) is:

```
p = w/n,  z² = 3.8416
centre = (p + z²/2n) / (1 + z²/n)
margin = z·√( (p(1−p) + z²/4n) / n ) / (1 + z²/n)
CI = [centre − margin, centre + margin]
```

Unlike the normal approximation `p ± z·√(p(1−p)/n)`, the Wilson interval stays inside [0,1], doesn't collapse to zero width at p=0 or p=1, and behaves correctly for the small `n` that young backtests have. It is the difference between an honest "we don't know yet" and a dishonest "0% ± 0%."

</details>

> **Honesty clause.** A thin, low-conviction window — realized win rates below the band midpoints, few coins reaching the higher tiers — is shown, not hidden. The page is built to display a weak edge as readily as a strong one, because a backtest you only trust when it flatters you isn't a backtest.

---

## Outcomes & grading

Every action an agent takes — simulated or live — is graded against ground truth and lands in its permanent win-rate ledger. This is what makes an agent's track record verifiable instead of asserted.

When a coin's outcome resolves, the settle loop grades any open action on it:

- **Win** — the coin graduated, or its peak multiple reached ≥2×.
- **Loss** — the coin rugged, or marked below 0.5× / peaked below 1.2×.
- **Flat** — everything in between.

Realized PnL is marked to market as `size · (current_mc / entry_mc − 1)`, and an agent's summary rolls up total, wins, losses, win rate, realized PnL, and ROI. The same grading powers the public [agent leaderboard](https://three.ws/oracle) and the platform-wide [activity floor](https://three.ws/activity), so every agent competes on a level, outcome-graded field.

---

## Product tour

The live Oracle is eight views over one engine. Every state — loading, empty, error, populated — is designed.

| View | What it's for |
|---|---|
| **Live conviction** | The default feed — every launch in the last 12h, scored, filterable by tier/category/min-score, sortable by score/hot/new, with a conviction-breadth bar and per-card pillar breakdown + sparkline. |
| **Movers** | Biggest conviction *changes* over a window — coins whose score is rising or falling, with the delta and tier change. |
| **Top wallets** | The pedigree leaderboard — every judged wallet ranked by track record. |
| **3D graph** | Every scored coin as a glowing sphere in a force-directed, category-clustered 3D field; size and color encode conviction and tier. |
| **The edge** | The backtest — win rate by tier, calibration, Brier, edge multiple. |
| **Proof** | The wins gallery — resolved calls with their score-at-entry versus the realized outcome. |
| **Agents** | The agent leaderboard — armed agents ranked by their outcome-graded record. |
| **Activity** | The live floor — every agent action, simulated or live, as it happens. |

The product is keyboard-driven (`/` focuses search, number keys jump tabs, arrows move between them), fully responsive, and built on a monochrome cool-gray palette where lightness encodes strength — brighter is stronger conviction.

---

## API reference

Everything on the page is a public endpoint. Reads are JSON, cached at the CDN and rate-limited per IP; live views are Server-Sent Events. Agent-config endpoints require auth scoped to the agent owner.

### Read endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/oracle/feed` | Live conviction feed — scored coins with pillars, badges, category, sparkline; plus a tier-level backtest summary. Filters: `tier, category, min_score, limit, network`. |
| `GET /api/oracle/coin` | Full intel for one mint — conviction, pillars, reasons, narrative, outcome, and the who's-in trader roster. Scores fresh (with LLM) on a cache miss. |
| `GET /api/oracle/market` | Live market half of the coin page for one mint — price + 5m/1h/6h/24h changes, market cap, FDV, liquidity, 24h volume, holders, supply, bonding-curve progress, security (mint/freeze authority, mutable metadata, transfer fee, top-10 concentration), DEX pairs, ATH/ATL for listed coins, and every social/explorer link. Fused live across DexScreener, pump.fun, GeckoTerminal, GoPlus, Birdeye and CoinGecko. |
| `GET /api/oracle/signal` | **Machine-ready.** A buy/watch/skip recommendation with confidence and a size factor, per mint or as the top N plays — built for agent polling. |
| `GET /api/oracle/batch` | Conviction for up to 20 mints at once. |
| `GET /api/oracle/backtest` | Win rate by tier with Wilson CIs, calibration ladder, Brier, and the edge summary. Filters: `period, tier, network`. |
| `GET /api/oracle/wallet` | A single wallet's profile + recent coins, or the wallet leaderboard. |
| `GET /api/oracle/wins` | The proven-wins gallery, ordered by ATH multiple, with a summary. |
| `GET /api/oracle/movers` | Biggest conviction changes over a window (rising / falling). |
| `GET /api/oracle/history` | A coin's conviction time-series (sparkline data) with a rising/falling/stable trend. |
| `GET /api/oracle/stats` · `/categories` · `/search` · `/leaderboard` · `/agent-stats` · `/activity` | Global KPIs, per-category intel, symbol search, the agent leaderboard, a single agent's record, and the global action feed. |
| `GET /api/oracle/og` | A dynamic 1200×630 OpenGraph conviction card (SVG) for sharing a coin. |

### Streams (SSE)

| Endpoint | Streams |
|---|---|
| `GET /api/oracle/stream` | New / updated conviction verdicts as they're scored (`min_score` filter). |
| `GET /api/oracle/trades` | A coin's live buy/sell tape, each trade annotated with the trader's wallet archetype. |
| `GET /api/oracle/action-stream` | New agent actions and outcome settlements as they land. |

### Write endpoints (auth)

| Endpoint | Does |
|---|---|
| `GET·POST /api/oracle/watch` | Read or arm an agent's watch config — bar, sizing, caps, filters, mode. Server-side validation clamps every limit. |
| `POST·DELETE /api/oracle/follow` | Subscribe a Telegram chat to an agent's conviction signals. |
| `POST /api/oracle/test-alert` | Send a test Telegram alert to verify setup. |
| `POST /api/oracle/social` | Ingest tweets to additively boost a coin's virality (never downgrades an LLM read). |

<details>
<summary><b>Deep dive — Example: the agent signal contract</b></summary>

`GET /api/oracle/signal?mint=…` returns a recommendation an agent can act on directly:

```json
{
  "mint": "…", "symbol": "…",
  "conviction": 88, "tier": "strong", "category": "ai",
  "pillars": { "pedigree": 82, "structure": 88, "narrative": 80, "momentum": 90 },
  "recommendation": {
    "action": "buy",            // buy | watch | skip
    "confidence": "medium",     // high | medium | low
    "size_factor": 0.75,        // 0–1 suggested sizing multiplier
    "note": "strong conviction — favorable across pedigree and structure"
  }
}
```

Recommendations map from tier: prime → `buy/high/1.0`, strong → `buy/medium/0.75`, lean → `watch`, watch/avoid → `skip`. Reads are cached 3s with stale-while-revalidate, so polling is cheap.

</details>

---

## Data model

Oracle owns five tables. The verdict cache is the heart; the rest are history, config, and the action ledger.

| Table | Grain | Notable columns |
|---|---|---|
| `oracle_conviction` | 1 row / mint | `score, tier, pedigree, structure, narrative, momentum, structure_cap, badges, reasons, components, category, smart_wallet_count, scored_at` |
| `oracle_narrative` | 1 row / mint | `category, narrative, virality, confidence, tags, source (llm\|heuristic), classified_at` |
| `oracle_conviction_history` | append on Δ≥3 | `score, tier, pillars, scored_at` · 72h retention |
| `oracle_agent_watch` | 1 row / agent | `armed, mode, min_score, min_tier, categories, per_trade_sol, max_daily_sol, max_open, require_smart_money, size_scaling, telegram_chat_id` |
| `oracle_watch_actions` | 1 row / action | `mint, conviction, tier, mode, size_sol, status, reason, entry_mc_usd, tx_signature, outcome, peak_multiple, realized_pnl_sol, acted_at, settled_at` |

The `components` blob on each conviction row is a full audit trail of the normalized inputs that produced the score — the reproducibility guarantee in storage form.

---

## Limits & failure modes

A model you can only trust when it flatters you is useless. Here is what Oracle cannot do, where it can be wrong, and how it's hardened.

- **It is a probability, not a prophecy.** A high score is the weight of on-chain evidence, not a guarantee. pump.fun is adversarial and heavy-tailed — most launches fail, and even a calibrated edge loses often. Read the tier as odds, size accordingly, and never bet what you can't lose.
- **Garbage-in on a young coin.** The first seconds of a launch are data-poor. Pedigree and momentum need wallets to show up before they say much; a brand-new coin leans on structure and a category prior. Scores sharpen as the footprint fills in — which is exactly why history and movers exist.
- **Adversarial structure.** The HOW pillar is a guardrail against known manipulation — bundles, fresh-wallet farms, funder clusters — but launderers iterate. New evasion patterns are caught by the outcome loop (they rug, reputation updates) before they're caught by a rule. The defense is the closed loop, not any single check.
- **Narrative lag & model error.** The WHAT pillar depends on a language model and a news feed; both can misread a story or miss a fast-breaking one. It's the lightest-weighted pillar for exactly this reason, and it degrades to a deterministic classifier rather than failing.
- **Outcome latency.** Win/loss isn't known until a coin resolves, so the backtest always trails the present. Recent windows are thin and their confidence bands are wide — and the page shows the width rather than hiding it.
- **Weights are expert priors (for now).** The 0.34 / 0.30 / 0.18 / 0.18 weights and every threshold are hand-set from domain knowledge, not yet learned from outcomes. That's a deliberate, transparent starting point — and the single biggest opportunity, covered next.

> **Not financial advice.** Oracle is an analytics and automation tool. Conviction scores, signals, and agent actions are informational. Live trading risks real funds; simulate first, cap hard, and treat every number as one input among many.

---

## Where it scales

The architecture — pure scoring over a coverage brain, behind a cached API, with a closed outcome loop — was chosen because it extends along several axes at once without a rewrite.

- **Calibration — learned weights & logistic calibration.** The biggest lever. Replace the hand-set pillar weights with weights fit to outcomes (logistic regression / gradient boosting on the same features), and post-process the raw score through Platt scaling or isotonic regression so the number *is* the probability. The backtest infrastructure to measure the gain already exists.
- **Coverage — more wallets, more density.** Every new wallet judged and every new launch resolved sharpens the WHO pillar and tightens the bands. The data flywheel is the moat — coverage compounds into calibration.
- **Surface — more chains, more venues.** The pillars are venue-agnostic — who/how/what/move generalize to any launch venue with on-chain footprints. The brain abstraction is the seam where a new chain plugs in.
- **Speed — push, not poll.** Streams poll the database today for serverless simplicity. Event-driven push (LISTEN/NOTIFY or a log tail) cuts verdict-to-screen latency toward the block, which on pump.fun is the whole game.
- **Inputs — richer signals.** Deeper social ingestion, holder-graph evolution over time, cross-coin creator/funder linkage, and order-flow microstructure are all additive pillars or sub-signals under the same fusion contract.
- **Ecosystem — an agent-native signal layer.** The machine-ready `/signal` endpoint and the action loop make Oracle a primitive other agents build on — discoverable, payable, and composable across the three.ws agent economy and MCP.

---

## PhD appendix

The formal view, for readers who want the model stated as a model.

### Oracle as a calibrated scoring classifier

Let a launch be a feature vector `x`. Oracle computes four pillar functions `f_k(x) ∈ [0,100]` for `k ∈ {ped, str, nar, mom}`, a weighted score, and a capped, clamped output:

```
s(x) = clamp( min( Σ_k w_k · f_k(x),  c(x) ),  0, 100 )

  w = (0.34, 0.30, 0.18, 0.18),   Σ w_k = 1
  c(x) = min over triggered structural/pedigree ceilings   // the veto
```

The intended semantics is that `s(x)/100 ≈ P(win | x)`, where `win = graduated ∨ ATH ≥ 2×`. Calibration measures the gap between intent and reality.

### Calibration objects

- **Reliability (calibration ladder):** partition scores into bins `B_j`; plot empirical `ŷ_j = (1/|B_j|)Σ 1[win]` against the bin's predicted rate. Perfect calibration ⇒ `ŷ_j ≈ s̄_j/100` for all j (the identity line).
- **Brier score:** `BS = (1/N) Σ (s_i/100 − y_i)²`, the mean squared error of the probabilistic claim; decomposable into reliability − resolution + uncertainty.
- **Wilson interval:** the 95% score interval on each tier/bin win rate (derivation in the evidence deep-dive), correct for small `n` and bounded to [0,1].
- **Monotonicity & edge:** require `ŷ` non-decreasing in the score bin (within tolerance); define edge multiple = `P(win | prime) / P(win | any)` and lift = the difference, both reported with their CIs.

### The improvement path, formally

The current `w` and thresholds are an expert prior — a fixed, interpretable linear model. The principled upgrade is to (1) fit `w` (and pillar internals) by maximizing log-likelihood / minimizing Brier on resolved outcomes, and (2) compose a monotonic calibration map `g: s ↦ P̂(win)` (Platt / isotonic) so the published number is a true probability. The cap `c(x)` can be retained as a hard monotone constraint, preserving interpretability — "structure can veto" — while the rest is learned. Crucially, the data, the outcome join, and the calibration metrics needed to *measure* that upgrade are already in production; the prior is a starting point chosen to be honest and legible, not a ceiling.

> **References & further reading.** Wilson (1927), *Probable inference, the law of succession, and statistical inference* — the score interval. Brier (1950), *Verification of forecasts expressed in terms of probability*. Platt (1999), probabilistic outputs for SVMs (Platt scaling). Zadrozny & Elkan (2002), isotonic calibration. Niculescu-Mizil & Caruana (2005), *Predicting good probabilities with supervised learning*.

---

## Glossary

| Term | Meaning |
|---|---|
| **Conviction** | The fused 0–100 score — the weight of on-chain evidence that a launch will win. |
| **Pillar** | One of the four independent reads: WHO (pedigree), HOW (structure), WHAT (narrative), MOVE (momentum). |
| **Tier** | The coarse band a score falls in: prime / strong / lean / watch / avoid. |
| **Cap (veto)** | A hard ceiling on the final score, set by a severe structural or pedigree red flag, applied before clamping. |
| **Proven wallet** | A wallet labelled smart-money/KOL or with a reputation score ≥70 — the pedigree currency. |
| **Win / loss / flat** | Outcome grades: win = graduated or ≥2× ATH; loss = rugged or <1.2×; flat = in between. |
| **Graduated** | A pump.fun coin that completed its bonding curve — the canonical success event. |
| **Armed** | An agent configured to act on conviction automatically, in simulate or live mode. |
| **Calibration** | How closely realized win rates match the scores that predicted them. |
| **Wilson interval** | The 95% confidence band on a win-rate estimate, correct for small samples. |

---

*Oracle is part of [three.ws](https://three.ws) — give your AI a body. · Living document, updated 2026-06-30.*

*Links: [Live Oracle](https://three.ws/oracle) · [Arm an agent](https://three.ws/oracle/arm) · [Activity floor](https://three.ws/activity) · [Changelog](https://three.ws/changelog)*
