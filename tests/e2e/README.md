# Browser end-to-end specs (Playwright)

Real-Chromium specs that drive product UI against the Vite dev server. Kept
separate from Vitest (which only globs `*.test.js`) by the `.spec.js` suffix and
`testDir: tests/e2e` in [`playwright.config.js`](../../playwright.config.js).

## Running

```bash
# whole suite (Vitest unit + Playwright e2e)
npm test

# just the browser specs
npm run test:e2e                                  # = playwright test

# one spec, fast iteration (no retries, single worker)
npx playwright test tests/e2e/launch-token-flow.spec.js --retries=0 --workers=1
npx playwright test tests/e2e/coin-buy-trade.spec.js   --retries=0 --workers=1
```

### Pre-start the dev server (avoids cold-start flakiness)

`playwright.config.js` will start `npm run dev` itself, but a cold Vite server
plus the first transform of the Solana/pump SDK module graph can take 30–60s. To
keep that cost out of the per-test budget, **pre-start a dedicated dev server**
and let Playwright reuse it (`reuseExistingServer` is on when `CI` is unset):

```bash
npm run dev            # leave running on :3000 in another shell
npx playwright test    # reuses the running server
```

Do not wait on `networkidle` in specs — the app holds long-lived connections
(HMR socket, live feeds). Wait on concrete DOM/state instead.

## The conversion-path specs

`launch-token-flow.spec.js` and `coin-buy-trade.spec.js` cover the platform's
most important path — launching a coin and trading it. Both follow the same
fidelity contract as `galaxy.spec.js`:

- **Real product code, driven — not re-implemented.** The specs import and run
  the actual modules ([`src/pump/launch-token-modal.js`](../../src/pump/launch-token-modal.js),
  [`src/game/coin-buy.js`](../../src/game/coin-buy.js)) on a minimal same-origin
  harness page so the dev server still resolves `/src/*` imports and relative
  `/api/*` fetches without booting the heavy homepage.
- **Endpoints fulfilled at the route layer with realistic payloads.** Vite dev
  proxies `/api/*` to production, so the launch-quote / launch-prep /
  launch-confirm endpoints, the pump buy/sell prep+confirm endpoints, and the
  Solana RPC proxy are intercepted with `page.route` to stay deterministic and
  never touch a real chain. The client makes the real fetches; the specs assert
  the real prep/confirm calls fire with the expected body. Prep transactions are
  genuine, parseable `@solana/web3.js` transactions built in Node.
- **`window.solana` is the only stubbed surface** — it is an external browser
  extension, not our code or a real API. Its `signTransaction` returns a
  serialized transaction exactly as a real wallet would, so the broadcast path
  runs for real against the fulfilled RPC.

### `launch-token-flow.spec.js` — all four launch steps

1. step 1 form validation (malformed symbol rejected, flow blocked)
2. step 2 cost breakdown + bonding-curve chart render
3. step 3 wallet connect arms the launch button
4. step 4 sign → broadcast → confirm → success share card (mint chip, share
   link, pump.fun link), asserting real `launch-prep` + `launch-confirm` fire
5. a broadcast failure surfaces specific, actionable copy (no generic catch-all)

### `coin-buy-trade.spec.js` — the buy/sell trade widget

1. wallet gating (connect → buy CTA)
2. lifecycle stage pill: a bonding-curve coin vs a graduated coin render
   distinct, unmistakable states (driven by the real `/api/pump/quote`
   detection)
3. SOL buy happy path: prep → sign → broadcast → settle
4. USDC buy happy path on a graduated coin (denomination upgrades to USDC)
5. sell happy path: switch to Sell, enter amount, prep → broadcast
6. a failed prep surfaces specific, actionable copy
