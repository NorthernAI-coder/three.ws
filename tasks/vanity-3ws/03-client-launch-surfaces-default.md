# Task 03 — Every client launch surface defaults to the `3ws` mark

## Goal

Make `3ws` the default the user *sees* and *grinds*, on every front-end launch surface.
The server (tasks 01/02) guarantees the mark regardless; the client's job is to grind it
locally (so the mint secret never leaves the browser for user-signed launches) and to
present the mark as a feature, not a buried option.

Remove the legacy "vanity is an opt-in box, default suffix `pump`" framing. The mark is the
default; advanced users may still *append* their own extra characters, but `3ws` always leads.

## Surfaces to update

Each of these posts to `launch-prep` / `launch-agent` or uses `launchWithVanity`:

1. **`src/agent-home-pumpfun.js`** — has an explicit vanity toggle. Today:
   ```js
   vanityEnabled: false,
   vanitySuffix: 'pump',
   ```
   - Remove the `pump` default and the "off by default" framing.
   - Always grind the brand: import `{ THREE_WS_VANITY, THREE_WS_MARK }` from `src/solana/vanity/brand.js` and pass `{ prefix: THREE_WS_MARK, ignoreCase: true }` to `grindVanity` / `launchWithVanity`.
   - The toggle, if kept, becomes "add extra characters after the `3ws` mark" — never a way to *disable* the mark. Default state: mark on, no extra chars.
   - Update the label/title copy: it currently says "ending in your suffix"; the mark is a **prefix**. Copy: "Every three.ws coin is stamped `3ws…` on-chain."

2. **`src/pump/pump-modals.js`** — launch modal(s). Wire the same default grind + progress.

3. **`src/agent-skills-pumpfun.js`** — programmatic/skill launch. Default `grindVanity(THREE_WS_VANITY)` before posting, unless the caller explicitly passes a pre-ground marked mint.

4. **`public/studio/launch-panel.js`** — the /studio launcher (state object near line 423–431 holds `mint/resolvedAgentId`). Grind `3ws` before the prep call; for the agent-signed path it posts to `launch-agent` (server stamps), for the owner-signed path grind client-side via `launchWithVanity` and co-sign.

5. **`src/solana/vanity/launch-with-vanity.js`** — make `prefix` default to `THREE_WS_MARK` when neither `prefix` nor `suffix` is provided, instead of throwing. Keep the explicit-pattern path for power users.

## Shared pattern (use everywhere)

```js
import { grindVanity } from './solana/vanity/grinder.js';        // adjust relative path
import { THREE_WS_MARK, THREE_WS_VANITY } from './solana/vanity/brand.js';

// before posting the launch:
const ground = await grindVanity({
  ...THREE_WS_VANITY,
  signal: abortController.signal,
  onProgress: ({ rate, eta }) => setVanityProgress({ rate, eta }),
});
const mintKeypair = Keypair.fromSecretKey(ground.secretKey);
// post mint_address (+ mint_secret_key_b64 for the server-signed path)
```

- Bound the grind with the existing `AbortController` already used for launch cancellation so the user can always back out.
- Because `3ws` is ~49k attempts, the WASM pool finishes well under a second — but still drive the real progress callback; never fake it (`CLAUDE.md` hard rule #5).

## Constraints (`CLAUDE.md`)

- **Delete the `'pump'` default.** No surface may suggest, prefill, or grind any string tied
  to another coin. The only branded default is `3ws`.
- No surface may offer a path that produces an **unbranded** three.ws coin. "Advanced"
  means *more* characters after `3ws`, never *zero*.
- Real async progress only — no `setTimeout` fake bars.
- Match each surface's existing design tokens; don't introduce new colors (see the monochrome
  token memory). Reuse the existing `.pumpfun-vanity-progress` / `.lp-*` classes.

## Success criteria

- From every surface above, a launch produces a `3ws…` mint, verified in the Network tab
  (`mint_address` in the request, `mint` in the response both start `3ws`).
- No surface references `pump` (or any non-`$THREE` coin string) as a vanity default.
- Cancelling mid-grind aborts cleanly and re-enables the launch button.
- Loading (grinding), success (marked mint shown), and error (grind aborted / prep failed)
  states are all designed — no blank or jarring transitions.

## Verification

- `npm run dev`, exercise each surface in a real browser, watch the Network tab.
- Headless WebGL note (see memory): these are DOM/network assertions, not pixel reads —
  verify via the request/response payloads and DOM text, per the screenshot gotcha memory.
- `grep -rn "vanitySuffix\|'pump'\|\"pump\"" src public/studio | grep -vi pump.fun` returns
  nothing tied to a vanity default after this task.
