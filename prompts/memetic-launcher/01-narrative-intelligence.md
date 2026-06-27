# 01 · Narrative Intelligence

## Mission
Know, at any second, **what the world is talking about** and which current is rising
fastest — so the launcher mints into live attention instead of into the void. A coin
timed to a real, rising narrative catches volume (and fees); a coin timed to nothing dies.

## Context
- Lives in `api/_lib/launcher-trends.js`, exporting `rankNarratives({network, sources, categories, limit})`.
- Returns ranked currents: `{ terms:[{term, score, sources[], kind}], themes:[…], top, providers }`.
- Consumed by `launcher-sources.js` (`gatherNarratives` / `pickSource`) → fed to the coining LLM.
- Cached (aggregate + per external provider) so a 1-tick/min cadence never hammers an API.

## Providers (all optional · time-bounded · degrade to silence · never throw)
**Internal (primary — they measure on-chain demand on the exact venue we ship to):**
- `coin_intel` — `pump_coin_intel`: categories/tags/narratives of high-quality coins first
  seen in the last 24h, weighted by `quality_score`. The single best leading indicator.
- `trending` — `oracle_conviction`: conviction-scored hot sectors (prime/strong tiers).
- `x` — `x_posts`: recent X chatter → hashtags + capitalised entities.

**External (culture + events — where the next meme is born; key-less, cached hard):**
- `hackernews` — HN Algolia front page (tech/internet zeitgeist).
- `reddit` — subreddit hot across a culture-leaning set (memes/solana/technology/worldnews).
- `wikipedia` — top pageviews (what people are actually looking up: people, films, sport, events).

## Scoring
- Per-term weight = `provider_weight × signal_strength` (quality score / upvotes / pageview rank).
- **Cross-source confirmation multiplier**: a term named by N independent sources is boosted
  `× (1 + 0.45·(N−1))` — agreement across channels is the strongest "this is real and rising" signal.
- Dominant `kind` (category/tag/narrative/culture/meme/event) = whichever contributed most weight.

## Hard rules (mechanical, not just prompt-level)
1. **Themes, never tickers.** Strip `$XXX`, `0x…`, `…usd`, `…pump`-shaped tokens. We follow
   culture, not other people's coins ($THREE rule, enforced in code).
2. **Brand safety.** A tragedy/violence/disaster denylist (with plural stemming) drops
   death/war/earthquake/etc. terms at the source — they never reach the model.
3. **Entities over noise.** Title-based sources (HN/Reddit/Wikipedia) extract capitalised
   proper-noun entities only; generic verbs/stopwords are dropped.

## Tasks (to extend)
1. **Add providers via MCP/APIs** — register new sources in `PROVIDERS` returning the same
   `{term, weight, kind}` shape: e.g. a Google-Trends MCP, TikTok/Twitch trending, GitHub
   trending, Polymarket movers, an LLM-summarised "what's trending" call. Wire each into
   `SOURCE_WEIGHT` and `EXTERNAL_SOURCES`; gate behind the config `sources` array.
2. **Recency/velocity** — prefer *accelerating* terms (delta vs. the prior window) over
   merely-large ones; persist a short rolling history to compute velocity.
3. **Saturation guard** — down-weight a narrative the launcher has already minted into many
   times in the last few hours (avoid self-spam; read `launcher_runs.trigger_detail`).
4. **Per-term safety classifier** — optional LLM/Granite-Guardian pass on the top terms
   before they reach the coiner, for nuanced (not keyword) brand-safety.

## Acceptance
- `rankNarratives` returns real, clean, on-trend terms in < ~1s with the default sources, and
  degrades to internal-only signal when every external API is unreachable.
- No ticker-shaped or tragedy terms ever appear in the output (covered by tests).
- New providers plug in without touching the ranker core; disabling all sources yields an
  empty list, not an error.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. Real APIs only. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
