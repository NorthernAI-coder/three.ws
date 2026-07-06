# 05 — Free Crypto Data API: Bonding-Curve / Graduation Status

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
An agent holding or watching a pump.fun token needs to know exactly where it is on the
bonding curve: % to graduation, SOL in curve, whether it has migrated to Raydium/PumpSwap.
Timing entries/exits around graduation is a core meme-trading move.

## Build — `GET /api/crypto/bonding`
- New file `api/crypto/bonding.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?mint=<pump.fun mint>`.
- Data: `_lib/pump-quote.js`, `_lib/pump-launch-feed.js`, `_lib/agent-pumpfun.js`, pump curve
  helpers + Solana RPC for the bonding-curve account state. Wrap existing logic; do not
  reimplement the curve math if a helper already computes it.
- Output: `{ mint, onCurve, bondingProgressPct, solInCurve, tokensRemaining,
  marketCapUsd, graduated, migratedTo, ts, source }`. `graduated:true` + `migratedTo` when
  it has left the curve.

## Catalog registration
Drop `api/_lib/crypto-catalog/bonding.js` (entry shape per 00-CONTEXT).

## States
Not a pump.fun mint / never launched → 400 with explanation. Already graduated → 200
`graduated:true`, curve fields `null`/final. RPC down → 503 + retry. Never 500.

## Tests
Progress % math; graduated vs on-curve branch; non-pump mint rejection. Synthetic/`$THREE` fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call on a real on-curve mint captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section + curl + use-case; cross-link `/api/crypto/launches`.
- [ ] `data/changelog.json` (tags: `feature`) — "Free bonding-curve status API for pump.fun tokens".
