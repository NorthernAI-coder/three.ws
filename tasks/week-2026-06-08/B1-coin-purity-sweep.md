# B1 — Coin-purity sweep: purge every non-$THREE token reference

**Track:** B — complete feature · **Priority:** P0 (non-negotiable rule) · **Effort:** 2–3h · **Depends on:** none

## Context

[CLAUDE.md](../../CLAUDE.md) is absolute: **the only coin/token the platform may ever name,
display, link, or promote is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). No
BONK, JUP, WIF, USDT, PYTH, JTO, or any other token — anywhere in shipped UI, examples, fixtures,
or docs. Treat any other coin reference like a leaked secret: remove it.

**The one allowed exception (do not "fix" these):** generic, coin-agnostic **settlement/quote**
plumbing where **USDC** or **wrapped SOL (wSOL)** is the settlement currency (x402 pays in USDC;
swaps quote against SOL/USDC). USDC/wSOL used purely as a settlement or quote asset is fine. USDT
is **not** in this exception. A token presented as a *selectable tile / example coin / promoted
symbol* is **never** fine, even USDC.

This sweep was already audited file-by-file. The exact edits are below. Apply them, then run your
own ripgrep pass to catch anything new.

## Edits to apply (verified)

| # | File:line | Current | Change to |
|---|-----------|---------|-----------|
| 1 | `src/swap-jupiter.js:30-39` | `QUICK_TOKENS` tiles incl. USDT, BONK, JUP, WIF, PYTH, JTO | Reduce to **SOL, USDC, THREE** only (array below). Custom mints still work via paste. |
| 2 | `api/x402/mint-to-mesh.js:66` | `DISCOVERY_INPUT_EXAMPLE = { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' }` (Bonk) | `{ mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump' }` |
| 3 | `api/x402/mint-to-mesh.js:84-90` | `DISCOVERY_OUTPUT_EXAMPLE`: Bonk mint, `name:'Bonk'`, `symbol:'Bonk'`, Bonk arweave `imageUrl` | $THREE mint, `name:'three'`, `symbol:'THREE'`; drop the Bonk `imageUrl` (set `hasImage:false` or a $THREE asset URL). Keep illustrative `color`/`bytes`. |
| 4 | `api/wk.js:612` | `input: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' }` (Bonk) | `input: { mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump' }` |
| 5 | `src/marketplace.js:5613` | `if (mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') return 'USDT';` | **Delete this line.** Keep the `USDC` branch above it; unknown mints already fall through to a short-mint label. |
| 6 | `src/shared/skill-purchase.js:118` | `if (mint === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') return 'USDT';` | **Delete this line.** Keep the `USDC` branch above it. |
| 7 | `src/solana/pyth-price.js:18-19` | `BONK: '72b0...'`, `WIF: '4ca4...'` in `PRICE_FEED_IDS` | **Remove the BONK and WIF entries.** Keep SOL/BTC/ETH/USDC. (This list is exposed via the live `pyth-price` agent skill.) |
| 8 | `src/agent-skills-jupiter.js:5` | Header comment: `...SOL, BTC, ETH, USDC, BONK, WIF, JUP, PYTH.` | `...SOL, BTC, ETH, USDC.` |
| 9 | `src/agent-skills-jupiter.js:68` | `description: 'Input token symbol (SOL, USDC, BONK, …) or raw mint address'` | `description: 'Input token symbol (SOL, USDC, …) or raw mint address'` |
| 10 | `src/agent-skills-jupiter.js:195` | `description: 'Token symbol to look up (e.g. BONK, WIF)'` | `description: 'Token symbol to look up (e.g. SOL, USDC)'` |
| 11 | `api/demo-economy.js:58` | Fallback pool row `{ name: 'JUP/SOL', ... }` | Replace with `{ name: 'THREE/SOL', ... }` (or drop to a single `SOL/USDC` row). Keep the existing `SOL/USDC` row. |
| 12 | `src/widgets/pumpfun-feed.js:469` | Photon link uses referral handle `@bonk`: `https://photon-sol.tinyastro.io/en/r/@bonk/${mint}` | Use the project's own Photon referral code (e.g. `/r/three.ws/`), or drop the PHO link. No literal `bonk` in shipped links. |
| 13 | `src/kol/wallets.json:17` | `"wallet": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"` (Bonk mint posing as a wallet; **served at runtime** by `api/kol/[action].js`) | Replace with a synthetic placeholder, e.g. `"THREEsynthetic2222222222222222222222222222"`. |
| 14 | `src/kol/radar-fixture.json:58-61` | `"mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"` (real USDT mint; **imported at runtime** by `src/kol/radar.js`) | Replace the mint with a synthetic placeholder, e.g. `"THREEsynthetic1111111111111111111111111111"`. Keep the fake name/symbol. |

### Exact replacement for `QUICK_TOKENS` (#1)

```js
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

const QUICK_TOKENS = [
	{ symbol: 'SOL',   name: 'Solana',   mint: SOL_MINT,   decimals: 9, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
	{ symbol: 'USDC',  name: 'USD Coin', mint: USDC_MINT,  decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
	{ symbol: 'THREE', name: 'three',    mint: THREE_MINT, decimals: 6, logoURI: '' },
];
```

`QUICK_TOKENS[0]`/`[1]` are still referenced as `defaultInputMint`/`defaultOutputMint` (around
`src/swap-jupiter.js:804-806`), so SOL→USDC remains the default pair — preserved. **Verify $THREE
decimals on-chain before applying** (pump.fun mints are typically 6); the modal also reads decimals
via the custom-mint path if needed.

## Do NOT flag these (verified allowed)

- `src/swap-jupiter.js:24-25` `SOL_MINT` / `USDC_MINT` constants (settlement/quote defaults).
- `api/x402/mint-to-mesh.js:167,181` `'USD Coin'`/`'USDC'` in `buildRequirements` (x402 settlement).
- `src/shared/skill-purchase.js:117` / `src/marketplace.js:5612` USDC branches (settlement asset).
- `src/game/ambient-crowd.js` `pepe`/`gigachad` (NPC usernames, not tokens).
- `public/three.svg` base64 substring matches (false positives).
- `public/chat/assets/*` build artifacts (gitignored; regenerated — fixing #2/#4 clears them).

## Then: your own sweep

After applying the table, run a fresh pass to catch anything missed or newly added:

```
rg -n -i '\b(bonk|wif|jup|pyth|jto|pepe|popcat|mew|bome|usdt|tether)\b' src api public workers \
  --glob '!*.test.js' --glob '!node_modules' --glob '!dist*' --glob '!*.map'
```

Judge each hit against the rule + the allowed exception. Fix real violations; leave settlement
plumbing. Low-priority cleanup (optional, do if quick): swap `bonk`/`doge`/`BONK` example strings in
JSDoc/comments at `api/x402/crypto-intel.js:36`, `api/pump/search.js:1`, `src/solana/jupiter-swap.js:138`
for `sol`/`three`.

## Acceptance criteria

- [ ] All 14 edits applied exactly (or with a documented, justified deviation).
- [ ] No selectable token tile, example coin, price-feed symbol, fixture mint, or referral handle
      references any token other than $THREE (USDC/wSOL settlement plumbing excepted).
- [ ] The two runtime-served fixtures (`src/kol/wallets.json`, `src/kol/radar-fixture.json`) contain
      no real third-party mainnet mints.
- [ ] Your fresh ripgrep pass returns only allowed settlement references or false positives.
- [ ] Swap modal still functions (SOL/USDC default pair intact; custom mint paste still works).

## Verification

1. `npx vitest run` (the swap + bonding-curve + skill-purchase tests must still pass).
2. `npm run dev`; open the swap modal — confirm only SOL/USDC/THREE tiles, custom paste works.
3. Re-run the ripgrep sweep; confirm a clean result.

## Rules

This is the platform's most important rule. When in doubt, remove rather than keep. Obey
[CLAUDE.md](../../CLAUDE.md).

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/B1-coin-purity-sweep.md`.
3. Commit your changes **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "fix: purge all non-$THREE token references (tiles, examples, fixtures, feeds); close B1"`
4. Do **not** push — the human controls pushes.
