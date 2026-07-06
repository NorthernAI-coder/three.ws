# 06 — Free Crypto Data API: Whale / Large-Buy Activity

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
An agent wants to know if big money is moving into a token (or the pump.fun market broadly)
before it commits — whale already in = price impact ahead; no whales = thin. A free read of
large buys is high-signal.

## Note on existing code
There is a PAID `api/x402/pump-agent-audit.js` doing "whale activity" for $0.02. Reuse its
data logic (`_lib/pump-volume-anomaly.js`, `_lib/gmgn-feed.js`, `_lib/agent-pumpfun.js`,
Solana RPC) but expose a FREE, cleaner version here. Do NOT delete the paid one in this
prompt (prompt 20 handles retirement decisions) — just build the free `/api/crypto/whales`.

## Build — `GET /api/crypto/whales`
- New file `api/crypto/whales.js`, free plain-handler pattern (00-CONTEXT).
- Input: `?mint=<optional — token-specific>&minSol=<default 5>&limit=<default 10, max 25>`.
  With `mint`: whale buys of that token. Without: top whale wallets active across pump.fun.
- Output: `{ scope:'token'|'market', mint, whales: [{ wallet, solMoved, txHash, ts }],
  whaleCount, totalSolMoved, signal:'bullish'|'bearish'|'neutral', ts, source }`. Signal from
  a documented deterministic rule (buy pressure), not an LLM.

## Catalog registration
Drop `api/_lib/crypto-catalog/whales.js` (entry shape per 00-CONTEXT).

## States
No whales over threshold → 200 empty + `neutral`, not an error. Feed down → 200 last-known/
empty + note. Never 500. Cap limit at 25.

## Tests
Threshold filter; token vs market scope; signal rule; empty case. Synthetic/`$THREE` fixtures.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Live call captured in PROGRESS.md.
- [ ] `docs/crypto-api.md` section (signal rule documented) + curl + use-case.
- [ ] `data/changelog.json` (tags: `feature`) — "Free whale-activity API for crypto agents".
