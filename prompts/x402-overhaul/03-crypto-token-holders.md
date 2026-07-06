# 03 — Free Crypto Data API: Holders & Concentration

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
An agent sizing a position needs holder distribution: how many holders, what % the top 10
hold, whether the dev/insiders still dominate. High concentration = exit risk. One free call.

## Build — `GET /api/crypto/holders`
- New file `api/crypto/holders.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?address=<mint>&chain=<solana>&limit=<N default 10, max 50>`.
- Data: Helius / Birdeye (`_lib/helius.js`, `_lib/birdeye.js`) for holder lists if keys
  exist; otherwise derive top holders from Solana RPC `getTokenLargestAccounts` + supply
  (keyless) for a coarse-but-real top-N. Never mock — if only keyless is available, return
  the keyless truth and mark `source`.
- Output: `{ address, chain, holderCount, top: [{ owner, amount, pct }], top10Pct,
  concentration: 'low'|'medium'|'high'|'unknown', ts, sources[] }`. `concentration` from a
  documented threshold on `top10Pct`.

## Catalog registration
Drop `api/_lib/crypto-catalog/holders.js` (entry shape per 00-CONTEXT).

## States
Invalid mint → 400. Brand-new token → 200 with whatever holders exist. No key + RPC gives
only largest accounts → 200 with `holderCount:null`, top-N present, noted. Never 500.

## Tests
top10Pct math; concentration thresholds; keyless RPC fallback path. `$THREE`/synthetic fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section (thresholds documented) + curl + use-case.
- [ ] `data/changelog.json` (tags: `feature`) — "Free holder distribution / concentration API".
