# 01 — Launch modal: post-launch CTA set

## Problem

After a user successfully launches a coin, the modal success screen (`_renderStep4` in [src/pump/launch-token-modal.js](../../src/pump/launch-token-modal.js), line ~806) shows:

- A shareable canvas card
- "Copy mint" button
- "Download card" button
- "Share on X" button
- A bare `View on pump.fun →` text link

There is no link to `/coin3d?mint=<X>` (the platform's own 3D token view), no link to `/pump-dashboard?agent=<Y>` (the management console), and the "Done" button just calls `location.reload()` with no navigation offer. A user who just launched a coin has nowhere obvious to go next within three.ws.

This is the highest-visibility moment in the entire launch flow and it currently dead-ends.

## Target files

- [src/pump/launch-token-modal.js](../../src/pump/launch-token-modal.js) — `_renderStep4` method and its CSS companion
- [src/pump/launch-token-modal.css](../../src/pump/launch-token-modal.css) — button/link styling

## Outcome

The step-4 success screen adds a styled CTA row beneath the share actions:

```
[ View in 3D ]   [ Manage on Dashboard ]   [ View on pump.fun ↗ ]
```

Behavior:
- **View in 3D** → opens `/coin3d?mint=<mint>` in a new tab. Always shown (mainnet launches only; skip on devnet).
- **Manage on Dashboard** → opens `/pump-dashboard?agent=<agentId>` in the same tab, then closes the modal. `agentId` is already threaded through `this._agentId` from the call site (`openLaunchTokenModal({ agentId, … })`). If `agentId` is not available (direct embed callers), link to `/pump-dashboard` without the query param.
- **View on pump.fun ↗** — keep this, but style it as a tertiary button matching the others. Remove the bare `<a>` text link.
- The "Done" button remains but changes label to "Close" and just closes the modal (`this._close()`). Remove `location.reload()` — the page already listens for the `agent-token-launched` CustomEvent and can refresh itself; a hard reload breaks callers that handle the event.

Style:
- CTA row uses `display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 16px;`.
- Primary button (`ltm-btn ltm-btn-primary`) for "View in 3D".
- Secondary button (`ltm-btn`) for "Manage on Dashboard".
- Tertiary with `target="_blank"` for "View on pump.fun".

## Implementation notes

1. `_renderStep4(mint, pumpUrl, agentId)` — add `agentId` as a third parameter. Callers pass it from `this._agentId` which is already set when `open({ agentId })` is called.
2. Build the dashboard URL: `agentId ? \`/pump-dashboard?agent=\${encodeURIComponent(agentId)}\` : '/pump-dashboard'`.
3. Build the coin3d URL: `/coin3d?mint=\${encodeURIComponent(mint)}`.
4. Only add the coin3d and pump.fun buttons when `this._network !== 'devnet'`.
5. "Manage on Dashboard" click handler: `this._close(); window.location.href = dashboardUrl;`.
6. Remove `location.reload()` from the "Done" handler; replace with `this._close()`.
7. The `agent-token-launched` CustomEvent already fires (line ~857 of launch-token-modal.js) — do not remove it; callers rely on it to refresh their state.

## Definition of done

- Launch a coin on devnet via the modal (agent-detail page → "Launch Token").
- Step 4 shows: canvas card, copy/download/share row, then a CTA row with correct buttons.
- On devnet: only "Close" appears in the CTA row (no coin3d or pump.fun links since devnet).
- On mainnet (or mocked): "View in 3D", "Manage on Dashboard", "View on pump.fun" all appear with correct hrefs.
- "View in 3D" opens `/coin3d?mint=<mint>` in a new tab.
- "Manage on Dashboard" navigates to `/pump-dashboard?agent=<agentId>` and the modal closes.
- "Close" closes the modal without a hard reload; the page reflects the new coin state via the `agent-token-launched` event.
- No console errors.
- `npm test` green.
- Completionist subagent run on changed files.
