# 07 — Free Crypto Data API: Symbol Availability

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
An agent about to launch a token wants to check candidate tickers for collisions (exact +
fuzzy) before committing — so its brand isn't lost among clones. A free batch check is a
natural top-of-funnel for the paid Pump Launcher.

## Note on existing code
There is a PAID `api/x402/symbol-availability.js` (`< $0.01`). Move this capability to a FREE
`/api/crypto/symbol` (it's a discovery utility that should drive launcher adoption, not earn
sub-cent dust). Reuse its collision logic. Leave the retirement of the paid route to prompt
20 — but in THIS prompt, add a one-line deprecation note in the paid file's header pointing
to the free route, and stage only that file + your new files.

## Build — `GET/POST /api/crypto/symbol`
- New file `api/crypto/symbol.js`, free plain-handler pattern (00-CONTEXT).
- Input: `{ symbols: string[] (max 20), chain?: 'solana' }` (POST) or `?symbols=A,B,C` (GET).
- Data: reuse the existing symbol-collision source the paid route uses (token registries /
  DexScreener / pump feed search). Exact + fuzzy match.
- Output: `{ results: [{ symbol, available, exactCollisions, fuzzyCollisions }],
  availableCount, takenCount, ts }`.

## Catalog registration
Drop `api/_lib/crypto-catalog/symbol.js` (entry shape per 00-CONTEXT).

## States
Empty/oversized list → 400 with the cap. No collisions → all `available:true`. Registry
source down → 200 degraded with a note. Never 500. Cap at 20 symbols.

## Tests
Exact vs fuzzy; cap enforcement; available/taken counts. Use made-up tickers in fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section + curl + use-case; cross-link the paid Pump Launcher.
- [ ] `data/changelog.json` (tags: `feature`,`improvement`) — "Symbol-availability check is now free".
