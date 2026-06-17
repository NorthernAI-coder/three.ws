# 03 — /pump-live: verify and fix end-to-end rendering

## Problem

[pages/pump-live.html](../../pages/pump-live.html) is the real-time showcase of new pump.fun launches — a 3D agent viewer on the left reacts to token events while a live feed streams on the right. The page has all the scaffolding (WebSocket to `wss://pumpportal.fun/api/data`, token list rendering, stat counters) but has never been formally verified end-to-end. Specific risks:

1. **3D agent viewer** — the `<agent-3d>` web component embedded in `#viewer-container` may not load its avatar correctly without a valid `agent-id` or fallback avatar URL wired to a real three.ws agent. If the component silently fails, the left panel is blank.
2. **WebSocket reconnection** — the 5-second reconnect timer (`setTimeout(connect, 5000)`) does not implement exponential backoff; on a production page with many concurrent users, all clients reconnect simultaneously after a PumpPortal outage.
3. **Token card rendering** — new token events (received as `onmessage`) must be parsed from PumpPortal's JSON envelope, mapped to the card template, prepended to `#token-list`, and the overflow capped. Verify this pipeline renders real names/symbols/images and does not leave `undefined` in card text.
4. **Stats bar** — the "Tokens Launched", "Volume", and "Age" counters must update in real time from incoming events. Verify they are wired to the WebSocket `onmessage` handler and not just initialized to zero.
5. **Mobile layout** — the flex row (`#main-container`) must stack on mobile. Verify the CSS breakpoint.
6. **PumpPortal envelope format** — PumpPortal's `subscribeNewToken` response format should be verified against the live feed; if the field names changed (e.g. `marketCap` → `usdMarketCap`), the card renderer is silently broken.

## Target files

- [pages/pump-live.html](../../pages/pump-live.html) — all logic is inline in a `<script>` block

## Verification steps

1. `npm run dev`. Open `http://localhost:3000/pump-live` in a browser.
2. Open the browser console and network tab.
3. Confirm the `wss://pumpportal.fun/api/data` connection opens and stays open (no immediate close/error).
4. Wait 30 seconds for real tokens to arrive (pump.fun launches ~1–3 tokens per minute). Confirm:
   - Token cards appear in `#token-list` with real name, symbol, and image (or a placeholder if no image).
   - The launch counter increments.
   - No `undefined`, `null`, or `[object Object]` text in any card field.
5. Open DevTools → Network → WS → inspect incoming frames. Map field names to what the renderer expects. Fix any field name mismatches.
6. Resize to 375px width. Confirm the layout stacks vertically (viewer above feed).
7. Simulate a WebSocket drop: `ws.close()` in the console. Confirm reconnect fires after 5s.

## Fixes to apply

- **Avatar loading**: in `#viewer-container`, the `<agent-3d>` tag (or its equivalent) must have a valid `avatar-url` pointing to a real three.ws platform avatar GLB from [public/avatars/](../../public/avatars/). Use the same default agent avatar used on [pages/home.html](../../pages/home.html) as the fallback. If `<agent-3d>` requires an `agent-id`, use the platform's demo agent ID (locate it via `grep -r 'demo.*agent\|agent.*demo' pages/ public/` or check [public/nav-data.js](../../public/nav-data.js)).
- **Field mapping**: read the actual PumpPortal `subscribeNewToken` response envelope from the live stream (or from [docs/pumpfun-program/](../../docs/pumpfun-program/) if documented there). Update the card renderer's field references to match.
- **Reconnect backoff**: replace the fixed 5s `setTimeout` with a capped exponential backoff: 2s → 4s → 8s → 16s → 32s → cap at 60s. Reset on successful open.
- **Stats wiring**: if any stat counter is not updating from `onmessage`, wire it now — no fake increments, no `setInterval` tickers. Real counts from real events only.
- **Empty state**: if the WebSocket hasn't delivered any tokens yet (first 5s), `#token-list` should show a skeleton row, not a blank void.
- **Error state**: if the connection fails permanently (e.g. PumpPortal is down), show a styled error message in the feed panel with a "Retry" button that calls `connect()`.

## Definition of done

- Open `/pump-live` with no console errors.
- Within 60 seconds, at least one real token card appears with correct name, symbol, and image (or placeholder). No `undefined` text anywhere.
- The stat counters increment for every new token event.
- Resizing to 375px width stacks the panels vertically.
- Closing and reopening the WebSocket (`ws.close()` → wait) triggers reconnect with the new backoff.
- The empty state (first 5 seconds) shows a skeleton or "Waiting for new launches…" message.
- The error state (force-kill connection and disable reconnect) shows a styled error + retry button.
- No console errors during normal operation.
- `npm test` green.
- Completionist subagent run on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/launchpad/03-pump-live-e2e-verify.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
