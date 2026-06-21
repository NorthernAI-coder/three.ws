# A05 — On-chain token-config validation + public token-economy & trust dashboard

> Phase A · Depends on: A01, A02 (their data feeds the dashboard) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Two things compound trust in a $1B token: (1) the platform can *prove* it is configured to
move funds to the right on-chain addresses, and (2) anyone can see the whole economy at a
glance — supply, treasury, buybacks, reflections, holders, tiers — with on-chain links. A
silent misconfiguration (wrong mint/treasury) would route real money to the wrong place;
a great public dashboard turns the economy into marketing.

## Where this lives (real files)
- `api/_lib/token/config.js` — mint, decimals, treasury, rewards, burn wallets from env; fail-closed guards.
- `api/three-token/[action].js` — existing `/stats`, `/leaderboard`, `/burns`, `/activity`.
- `pages/three-token.html` + `src/three-token-page.js` — public token page.
- `pages/` + `data/pages.json` — add a `/three-token/proof` or `/three/trust` page if warranted.

## Current state & gaps
- Token config is env-only; no runtime check that env matches the real on-chain mint/treasury.
- The "Programmatic buybacks" panel exists but there's no single, comprehensive economy view.
- Holders, buybacks, reflections, tiers, burns live across endpoints with no unified proof surface.

## Build this
1. **Startup/boot validation:** add `validateTokenConfig()` that fetches the live mint (supply, decimals) and verifies it matches `TOKEN_MINT`/decimals; verifies the treasury & rewards wallets exist and (optionally) that recent transfers land there. Run it in a boot/health path and fail loudly on divergence. Add a test that pins the expected mint = `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
2. **Unified economy endpoint:** `GET /api/three-token/economy` returning on-chain supply + circulating, treasury address + balance, rewards pool balance, last buyback (amount, tx, when) + 7d/30d totals, last reflection + 7d/30d totals, holder count + tier distribution, total burned. All numbers link to Solscan.
3. **Public trust dashboard:** a polished page (live 3D optional, reuse existing widgets) that renders the economy endpoint: every claim on the token page backed by a clickable on-chain receipt. Designed loading/empty/error states. Mobile-first.
4. **Tier distribution:** show how many holders sit in each tier and the $THREE needed to climb — doubles as an upgrade funnel.
5. **No other coin** anywhere (CLAUDE.md). Only `$THREE`.

## Out of scope
- Building the buyback/reflection *execution* (A01/A02) — this consumes their outputs.

## Definition of done
- [ ] `validateTokenConfig()` runs at boot/health, fails on mismatch, and a test pins the canonical mint.
- [ ] `/api/three-token/economy` returns real, link-resolving figures.
- [ ] Trust dashboard page is live, reachable from the token page + nav, with all states designed and responsive.
- [ ] `npx vitest run` green; `npm run build:pages` passes (new page → changelog auto-entry); committed + pushed to both remotes.

## Verify
- Temporarily set a wrong treasury env locally → boot/health fails clearly; restore.
- Open the trust page in a browser; click receipts → they resolve on Solscan.
