# 09 — Free Crypto Data API: Trending / Hot Tokens

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
A discovery agent wants "what's hot right now" — tokens ranked by momentum (volume spike,
buy pressure, holder growth) so it can surface opportunities without scraping five sites.

## Build — `GET /api/crypto/trending`
- New file `api/crypto/trending.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?window=<5m|1h|24h default 1h>&limit=<default 20, max 50>&source=<pumpfun|all>`.
- Data: `_lib/pump-trending-score.js`, `_lib/pump-volume-anomaly.js`, `_lib/gmgn-feed.js`,
  DexScreener trending. Compose a ranked list; document the ranking signal. Wrap existing
  scoring helpers rather than inventing a new score.
- Output: `{ window, tokens: [{ mint, symbol, name, marketCapUsd, volumeUsd,
  change, score, url }], count, ts, sources[] }`. Ranked by `score` desc.

## Catalog registration
Drop `api/_lib/crypto-catalog/trending.js` (entry shape per 00-CONTEXT).

## States
Source down → 200 with whatever ranked data is available + note. Empty → 200 empty. Never
500. Cap limit at 50.

## Tests
Ranking order; window param; limit cap; source filter. Synthetic fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section (ranking signal documented) + curl + use-case.
- [ ] `data/changelog.json` (tags: `feature`) — "Free trending-tokens API for crypto agents".
