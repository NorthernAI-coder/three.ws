# Task: End-to-end tests + manual verification matrix for /club

## Repo context

Working tree: `/workspaces/three.ws`. The /club page is touched by
many systems — x402 settlement, animation manager, SSE feed, cron
payouts, Web Audio, post-processing. Each prior prompt ships its
own unit tests. This prompt adds:

- A Playwright smoke that boots the dev server, loads `/club`,
  intercepts the x402 settle, and asserts visible behavior.
- A real-wallet mainnet manual verification checklist used before
  every release.

## Rails (CLAUDE.md — non-negotiable)

- No mocked browser. Playwright drives a real Chromium.
- The smoke MAY stub the x402 settle network response (signing a
  mainnet tx in CI is unsafe) — but the stub must produce the same
  JSON shape the real endpoint produces.
- Visual asserts: count of canvas-visible meshes, console errors,
  network success — not pixel-perfect screenshots (too brittle).
- Manual matrix is signed-off by a human; no agent ticks it.

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, return:
>
> 1. Whether Playwright is already a dev dep — check
>    [package.json](../../package.json).
> 2. If yes, the existing `playwright.config.*` and any spec dir.
> 3. The `npm run dev` boot pattern (port, env vars required, how
>    long it takes to be ready).
> 4. The repo's existing `test` script — does `npm test` invoke
>    Playwright today, or just Vitest/Jest?

Wait for A.

## What to implement

### Step 1 — Playwright wiring

If Playwright is not yet a dep:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Create `playwright.config.js` at repo root:

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

Add to `package.json`:

```json
"scripts": {
  "test:e2e": "playwright test",
  "test": "vitest run && playwright test"
}
```

(Adjust to whatever the existing `test` script does — keep the unit
test runner the way subagent A reports it.)

### Step 2 — Playwright smoke for /club

`tests/e2e/club.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.describe('/club', () => {
  test('venue loads + tip settles + dancer performs', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    // Stub the x402 settle endpoint to return a deterministic ticket.
    await page.route('**/api/x402/dance-tip*', async (route) => {
      const url = route.request().url();
      const u = new URL(url);
      const dancer = u.searchParams.get('dancer') ?? '1';
      const dance  = u.searchParams.get('dance')  ?? 'rumba';
      // First call: 402 challenge; we tell the X402 helper to skip the modal
      // by injecting a flag in window before tipping.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          ticketId: 'e2e-ticket-1',
          dancer, dance, clip: 'rumba', label: 'Rumba',
          loop: true, durationSec: 6,
          startsAt: new Date().toISOString(),
          endsAt:   new Date(Date.now() + 6000).toISOString(),
          payer: 'e2e-test-payer',
          network: 'solana',
          amountAtomics: '1000',
          asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        }),
      });
    });

    // Bypass the X402 wallet modal by stubbing window.X402.pay before any
    // module runs (Vite ESM order makes this race-prone; use addInitScript).
    await page.addInitScript(() => {
      window.X402 = {
        pay: async ({ endpoint }) => {
          const r = await fetch(endpoint);
          return { result: await r.json() };
        },
      };
    });

    await page.goto('/club');

    // Venue must finish loading (status pill flips to 'ok').
    await expect(page.locator('#club-status')).toHaveAttribute('data-kind', 'ok', { timeout: 30_000 });

    // Tip pole 1.
    await page.locator('.club-tip-btn[data-dancer="1"]').click();

    // Tip-feed row appears for dancer 1.
    await expect(page.locator('.club-tip-row').first()).toContainText('dancer 1');

    // No console errors during the run.
    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0);
  });

  test('keyboard VIP cam shortcuts work', async ({ page }) => {
    await page.goto('/club');
    await page.keyboard.press('2');
    // No way to read camera pose from outside three.js cheaply — assert via
    // a debug DOM attribute the camera state machine writes for tests.
    await expect(page.locator('#club-stage')).toHaveAttribute('data-cam-mode', 'vip');
    await page.keyboard.press('Escape');
    await expect(page.locator('#club-stage')).toHaveAttribute('data-cam-mode', 'free');
  });

  test('leaderboard renders + tab switching', async ({ page }) => {
    await page.route('**/api/club/leaderboard*', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          window: 'day',
          rows: [
            { dancer: '1', display_name: 'Nyx',    total_atomics: '4000', tip_count: 4, unpaid_atomics: '4000' },
            { dancer: '2', display_name: 'Ari',    total_atomics: '3000', tip_count: 3, unpaid_atomics: '0'    },
            { dancer: '3', display_name: 'Sable',  total_atomics: '1000', tip_count: 1, unpaid_atomics: '0'    },
            { dancer: '4', display_name: 'Vesper', total_atomics: '0',    tip_count: 0, unpaid_atomics: '0'    },
          ],
        }),
      });
    });
    await page.goto('/club');
    await expect(page.locator('#club-lb-rows .club-lb-row').first()).toContainText('Nyx');
  });
});
```

Test depends on prompts 06 (camera state DOM attribute) and 08
(leaderboard widget) — if those haven't shipped yet, mark the
specific assertions as `test.skip()` with a tracking comment, do
not delete them.

### Step 3 — DOM hooks for tests

Add the camera-mode attribute write in
[src/club.js](../../src/club.js) (prompt 06):

```js
clubCam.onModeChange = (mode) => {
  document.querySelector('#club-stage')?.setAttribute('data-cam-mode', mode);
};
```

These are zero-cost in production and the only way Playwright can
introspect the three.js state without injecting probes.

### Step 4 — CI integration

If the repo has a CI workflow (`.github/workflows/*.yml`), add:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium
- name: E2E
  run: npm run test:e2e
```

If no CI workflow exists yet, skip this step — manual `npm run
test:e2e` from a dev box covers it.

### Step 5 — manual verification checklist

Create `docs/club/RELEASE_CHECKLIST.md` (the file is read once per
release, not by CI):

```markdown
# /club release checklist

Run on a clean checkout after `npm install && npm run build`.

## Local smoke
- [ ] `npm run dev` boots, `/club` loads under 5s on broadband.
- [ ] Venue renders authored GLB, no console errors.
- [ ] All four dancers visible at backstage doors.
- [ ] `npm test` green (unit + e2e).
- [ ] `npm run test:e2e` green standalone.

## Real wallet (mainnet)
- [ ] Connect Phantom on Solana. Tip pole 1 for $0.001 USDC.
- [ ] On-chain confirmation in Solscan within 5s.
- [ ] Dancer 1 walks from backstage to pole.
- [ ] Music for the chosen style fades up; ambience fades down.
- [ ] Volumetric spotlight cone ramps up.
- [ ] Tip row appears in the right-panel feed.
- [ ] Open `/club` in a second browser; same tip row appears via SSE.

## Cron payouts
- [ ] Repeat tips until dancer 1's unpaid total exceeds 0.005 USDC.
- [ ] Trigger `/api/cron/club-payouts` with CRON_SECRET.
- [ ] On-chain payout signature recorded in `club_payouts`.
- [ ] `club_tips.paid_at` set on swept rows.
- [ ] Leaderboard "unpaid" column drops for dancer 1.

## Mobile
- [ ] iPhone 12 Safari: profile `medium`, ≥30 fps.
- [ ] Pixel 6 Chrome:    profile `medium`, ≥30 fps.

## Deploy
- [ ] Vercel preview deploy of the branch passes both x402 endpoints
      reachable + SSE keepalive.
- [ ] Promote to production.
- [ ] Verify production OG card renders for `/club` via Twitter card
      validator.
- [ ] Verify x402 bazaar discovery: `curl -i https://three.ws/api/x402/dance-tip`
      returns 402 with the discovery extension intact.
```

This file is human-signed. CI does not check it.

### Step 6 — manual end-to-end

Run the checklist end-to-end on a clean checkout. Record results in
`docs/internal/PROGRESS.md` (extend the existing log).

## Definition of done

- Playwright wired into the repo with `tests/e2e/club.spec.js`.
- The three smoke specs pass against `npm run dev`.
- DOM test hooks (`data-cam-mode` etc.) added where the camera
  state machine writes them.
- `docs/club/RELEASE_CHECKLIST.md` exists and has been run once
  end-to-end with results captured.

## Constraints

- Do not stub the unit-test layer's `sql` template inside the
  Playwright run — the e2e suite must exercise the real DB if the
  prompts 07/08 features are in. Use a per-branch Neon database or
  a local Postgres container if CI runs Playwright.
- Do not commit any private key, mnemonic, or wallet secret into
  the checklist file. Reference env var names only.
- Do not gate releases on pixel-perfect screenshot diffs. Visual
  regression for a moody dark club is fragile.
- Do not skip the manual mainnet verification before a release —
  the agent suite cannot prove the on-chain payout path works.
