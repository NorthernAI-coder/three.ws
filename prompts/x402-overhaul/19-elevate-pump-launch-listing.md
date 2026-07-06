# 19 — Elevate the Pump Launcher Listing

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Why
`api/x402/pump-launch.js` is a genuinely strong product: deploy a brand-new pump.fun token in
one paid call — the server fronts the SOL and signs the create tx, so the agent needs no SOL
and no account, just USDC. Optional vanity mint. That's real utility. Make the listing sell it
and wire it to the free funnel.

## Scope
Listing quality + discovery + the free→paid funnel — NOT the deploy/signing internals (they
work). Do not change how the SOL fronting or tx signing works.

## Build
- Rewrite the `BAZAAR` description to lead with the use-case ("launch a token autonomously,
  no SOL, no account — pay USDC"), the inputs (name, symbol, metadataUri OR imageUrl we pin,
  creator-rewards wallet, optional vanity prefix/suffix), the output (mint, tx sig, pump.fun
  URL), and networks. Make the schema complete enough to call blind.
- Wire the funnel: reference the FREE `/api/crypto/symbol` (ticker check) and
  `/api/crypto/launches` as pre/post steps in the description + docs, so the free data API
  feeds paid launches.
- Confirm the $5.00 price (or current) in `_lib/x402-prices.js` matches the handler; fix
  metadata drift only.
- Update `api/wk.js` discovery mirror for `/api/x402/pump-launch`; run
  `node scripts/verify-x402-discovery.mjs` until clean.

## States / correctness
Live 402 ↔ discovery parity (verify script). Do NOT execute a real mainnet launch to test
(that costs real SOL and creates a real token — CLAUDE.md: no real third-party mints in
tests). Verify the 402 challenge + input validation + dry-run/validation path without
broadcasting. Confirm the description's promised fields exist in the handler by reading it.

## Tests
Discovery/live parity; input validation (missing name/symbol/image); schema completeness. No
real broadcast.

## Definition of done
Inherit 00-CONTEXT DoD + gates (skip new-endpoint parts). Plus:
- [ ] Sharpened description + accurate schema + funnel links; verify script passes (paste output).
- [ ] 402 challenge + validation path captured in PROGRESS.md (no real launch).
- [ ] Pump Launcher doc in `docs/` created/updated with the full flow + funnel.
- [ ] `data/changelog.json` (tags: `improvement`) — "Pump Launcher listing sharpened + wired to
      free symbol/launches APIs".
