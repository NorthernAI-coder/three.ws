# 22 — Pump.fun launch, Oracle, trading & $THREE

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

The token surfaces are where three.ws meets real money and real on-chain stakes:
launch-a-coin, the Launchpad Studio, Coin Intelligence/Radar, the Oracle conviction
engine, the Trader Leaderboard, Smart Money, Arm-your-agent, the Strategy Lab, and the
`$THREE` token page. These pages must show real Solana data, never stall on a flaky
RPC, never leak a provider error — and they must be **flawless on $THREE-only
compliance**, because a single stray ticker in code, copy, or sample data is a
credibility (and legal) failure for the platform's own token.

## Mission

Harden every pump/oracle/trading surface to production: real-data feeds with resilient
RPC, every state designed, no leaked provider internals — and run a strict $THREE-only
compliance audit that confirms the only coin promoted anywhere is `$THREE`
(CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).

## Map (trust but verify — files move)

- **Launch-a-coin** — [pages/launch.html](../../pages/launch.html) (`/launch`),
  [src/pump/launch-token-modal.js](../../src/pump/launch-token-modal.js) (launcher modal).
  Pump backend dispatch: [api/pump/[action].js](../../api/pump/%5Baction%5D.js)
  (`launches`, `snapshot`, etc.), [api/pump/safety.js](../../api/pump/safety.js),
  [api/pump/trending.js](../../api/pump/trending.js).
- **Launchpad Studio (page-builder + CMS)** — [pages/launchpad.html](../../pages/launchpad.html)
  (`/launchpad`), [src/editor/launchpad-studio.js](../../src/editor/launchpad-studio.js)
  (template → live preview → publish to `/p/<slug>`).
- **Platform launch directory (runtime exception — keep)** — [pages/launches.html](../../pages/launches.html)
  (`/launches`, renders coins launched through three.ws over `pump_agent_mints`),
  [pages/launch-detail.html](../../pages/launch-detail.html) (`/launches/<mint>`,
  runtime user-supplied mint).
- **Coin Intelligence / Radar** — [pages/coin-intel.html](../../pages/coin-intel.html)
  (`/coin-intel`), [pages/radar.html](../../pages/radar.html) (`/radar`),
  [src/radar.js](../../src/radar.js), [api/pump/coin-intel.js](../../api/pump/coin-intel.js).
- **Oracle (conviction)** — [pages/oracle.html](../../pages/oracle.html) (`/oracle`),
  [src/oracle.js](../../src/oracle.js), [api/oracle/feed.js](../../api/oracle/feed.js),
  [api/oracle/coin.js](../../api/oracle/coin.js), conviction engine in
  [api/_lib/oracle/conviction.js](../../api/_lib/oracle/conviction.js) (+ `narrative.js`,
  `archetype.js`, `known-wallets.js`, `settle.js` in [api/_lib/oracle/](../../api/_lib/oracle)).
- **Arm-your-agent (trading automation)** — [pages/arm.html](../../pages/arm.html)
  (`/arm`, `/oracle/arm`), [src/arm.js](../../src/arm.js) (reuses `/api/agents`,
  `/api/oracle/watch`, `/api/oracle/test-alert`).
- **Strategy Lab** — [public/strategy-lab.html](../../public/strategy-lab.html)
  (`/strategy-lab`). Sniper dashboard: [src/dashboard-next/pages/sniper.js](../../src/dashboard-next/pages/sniper.js).
- **Trader Leaderboard / Smart Money** — [pages/leaderboard.html](../../pages/leaderboard.html)
  (`/leaderboard`), [src/leaderboard.js](../../src/leaderboard.js),
  [api/_lib/trader-stats.js](../../api/_lib/trader-stats.js);
  [pages/smart-money.html](../../pages/smart-money.html) (`/smart-money`),
  [api/pump/smart-money.js](../../api/pump/smart-money.js).
- **$THREE token page** — [pages/three-token.html](../../pages/three-token.html)
  (`/three-token`), [src/three-token-page.js](../../src/three-token-page.js),
  [api/three-token/[action].js](../../api/three-token/%5Baction%5D.js),
  [src/pump/three-token-data.js](../../src/pump/three-token-data.js) (canonical mint),
  [api/_lib/token/config.js](../../api/_lib/token/config.js).
- **Tests** — [tests/api/granite-oracle.test.js](../../tests/api/granite-oracle.test.js),
  [tests/smart-money.test.js](../../tests/smart-money.test.js),
  [tests/api/pump-curve.test.js](../../tests/api/pump-curve.test.js).

## Do this

1. **Exercise every surface in a real browser** (`npm run dev`): `/launch`, `/launchpad`,
   `/launches` + a `/launches/<mint>` detail, `/coin-intel`, `/radar`, `/oracle`, `/arm`,
   `/strategy-lab`, `/leaderboard`, `/smart-money`, `/three-token`. Watch console/Network
   — zero errors/warnings; every page renders real Solana/pump data, not a placeholder.
2. **Run the $THREE-only compliance audit.** Grep the codebase for any non-`$THREE`
   ticker/symbol or hardcoded mint in code, comments, copy, fixtures, and sample data:
   ```
   grep -rniE '\$[A-Z]{2,6}\b' pages/ src/ api/ public/ | grep -v 'THREE'
   grep -rnoE '[1-9A-HJ-NP-Za-km-z]{32,44}' api/pump api/oracle src/pump src/kol
   ```
   Confirm every hit is one of: the `$THREE` CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`;
   a clearly-synthetic placeholder (`THREEsynthetic1111…`); a Solana utility mint (wSOL
   `So111…112`, USDC `EPjF…Dt1v`); a platform fee / wallet / EVM factory address (not a
   coin); a **runtime user-supplied** mint (launcher input, `/launches/<mint>`); or the
   **platform launch directory** over `pump_agent_mints`. Remove or fix anything that
   markets/recommends/hardcodes another coin. Treat a stray ticker like a leaked secret.
3. **No provider/RPC internals reach the user.** Audit error paths in `api/pump/*`,
   `api/oracle/*`, and `api/_lib/oracle/*`: Helius/RPC/DEX errors, rate-limit bodies,
   raw stack traces, and vendor URLs must become neutral, actionable copy. Keep raw
   detail in server logs only.
4. **Resilient on-chain reads.** Every Solana RPC / pump / Helius call must time out and
   retry/fall back via the existing cockatiel resilience helper — never stall a feed.
   Verify the trending/coin-intel/oracle feeds degrade gracefully when RPC is slow or a
   provider 429s (designed stale/partial state, not a dead spinner).
5. **Every state designed** on each surface: loading (skeleton rows, not spinners),
   empty (e.g. no launches yet, no conviction signals yet → tell the user what's next),
   error (RPC down → "data delayed, retrying" with a retry), and overflow (long lists
   paginated/virtualized; long names truncated). Designed for 0 / 1 / 1000 items.
6. **Launch + arm flows are real and safe.** Confirm `/launch` produces a real pump.fun
   launch (the launcher accepts the runtime mint/params — generic plumbing exception),
   `/launches` lists it, and `/arm` wires conviction-threshold automation through
   `/api/oracle/watch` with real agent state. No fake fills, no mock PnL on the
   leaderboard — `trader-stats.js` must compute from real on-chain history.
7. **$THREE token page integrity.** `/three-token` must read live price/holders/activity
   from real APIs, reference only the canonical mint
   (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`), and degrade gracefully if a feed is
   down. Any "buy/swap" affordance routes to a legitimate runtime-mint swap, never names
   another token.
8. **Accessibility, mobile, performance.** ARIA on tables/controls, keyboard nav,
   responsive at 320/768/1440, lazy-load charts/3D, debounce search inputs, paginate
   large feeds. No layout thrash on live-updating tables.
9. **Run the tests:** `npx vitest run tests/api/granite-oracle.test.js
   tests/smart-money.test.js tests/api/pump-curve.test.js`. Add cover for any RPC-failure
   or error-masking path you fixed; add a test asserting no non-`$THREE` ticker appears
   in shipped copy/fixtures if a gap exists.
10. Add a `data/changelog.json` entry for any user-visible change and run
    `npm run build:pages`.

## Must-not

- Do not mention, hardcode, link, render, or recommend any coin other than `$THREE`
  anywhere — code, comments, copy, fixtures, sample data, or commit message. The only
  two exceptions are runtime user-supplied mints (launcher input, `/launches/<mint>`)
  and the platform launch directory over `pump_agent_mints`. Never paste a real
  non-`$THREE` mint/creator/holder address into tests or fixtures.
- Do not surface a raw RPC/Helius/DEX/provider error, rate-limit body, or vendor URL to
  the user.
- Do not ship a feed with no timeout/fallback, a fake-loading bar, or mock PnL/fills.
- Do not break the working pump/oracle data paths while hardening — add to unprotected
  paths, prefer the existing cockatiel helper over hand-rolled retries.

## Acceptance (all true before claiming done)

- [ ] All token surfaces render real Solana/pump data in a real browser with no console
      errors/warnings: `/launch`, `/launchpad`, `/launches`(+detail), `/coin-intel`,
      `/radar`, `/oracle`, `/arm`, `/strategy-lab`, `/leaderboard`, `/smart-money`,
      `/three-token`.
- [ ] $THREE-only audit clean: every ticker/mint in code, copy, and fixtures is `$THREE`,
      a synthetic placeholder, a utility mint/wallet, a runtime user-supplied mint, or
      the `pump_agent_mints` launch directory. No other coin promoted anywhere.
- [ ] Every provider/RPC failure yields neutral, actionable copy — no internals leaked.
- [ ] Feeds are resilient (timeout + retry/fallback via cockatiel) and degrade gracefully
      under slow/429 RPC.
- [ ] Loading/empty/error/overflow states designed across all surfaces (0/1/1000 items).
- [ ] Launch, arm, leaderboard, and $THREE token data are real (no mock fills/PnL); the
      $THREE page references only the canonical mint.
- [ ] ARIA/keyboard, responsive 320/768/1440, and lazy-loading verified.
- [ ] Listed tests pass; new RPC-failure / compliance coverage added where there was a gap.
- [ ] Changelog updated and `npm run build:pages` is clean.
