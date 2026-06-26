# Agent Playwright Screen Streaming Service

## Context

three.ws has a live agent watch system built and deployed:

- `api/agent/screen-stream.js` — SSE endpoint, streams frames + activity to any client watching
- `api/agent/screen-push.js` — POST endpoint that accepts base64 PNG frames from external agent processes
- `src/shared/agent-watch-panel.js` — 2D panel (screen + avatar webcam) shown on every agent profile
- `src/game/agent-desk.js` — 3D desk with live CanvasTexture monitor in the /play world
- `/dashboard-next/watch?agentId=<id>` — standalone full-page watch view

The SSE stream already delivers real agent-action records as the "screen" when no frames are being pushed. This prompt is about building the **Playwright process** that pushes real browser screenshots.

## What to build

A Node.js service (`services/agent-screen-caster/`) that:

1. **Accepts an agent config** (agentId, owner bearer token, tasks to run)
2. **Spins up a Playwright Chromium browser** (headless by default, non-headless for dev)
3. **Captures screenshots** every 300–500ms OR on every `page.on('load')` / `page.on('requestfinished')` event (whichever is more event-driven)
4. **Compresses each screenshot** to JPEG at 75% quality then base64-encodes it
5. **POSTs each frame** to `https://three.ws/api/agent/screen-push` with the agent's bearer token
6. **Also POSTs structured activity** (`/api/agent/screen-push` with `actions` array) whenever the agent takes a meaningful action (navigation, click, form submit, trade)

## File structure

```
services/agent-screen-caster/
  index.js          — CLI entrypoint, reads .env + argv
  caster.js         — AgentScreenCaster class (Playwright + push loop)
  tasks/
    pump-monitor.js — example task: watch a pump.fun coin page
    trade.js        — example task: Solana trade UI automation
  package.json
  .env.example
```

## Technical spec

### `caster.js` — AgentScreenCaster

```js
class AgentScreenCaster {
  constructor({ agentId, bearerToken, pushUrl, frameIntervalMs, jpegQuality })
  async launch(headless = true)            // start Playwright
  async navigate(url)                      // go to a URL, auto-push frame
  async act(description, fn)              // named action wrapper — pushes activity + frame
  startFrameLoop()                         // setInterval for continuous frame push
  stopFrameLoop()
  async pushFrame()                        // capture → compress → POST
  async pushActivity(actions)             // POST to /api/agent/screen-push with actions array
  async close()                            // tear down Playwright
}
```

### Frame push format (already defined in the API)

```http
POST /api/agent/screen-push
Authorization: Bearer <agentBearerToken>
Content-Type: application/json

{ "agentId": "...", "frame": "<base64 JPEG>", "seq": 1234567890 }
```

### Activity push format

```http
POST /api/agent/screen-push
Authorization: Bearer <agentBearerToken>
Content-Type: application/json

{
  "agentId": "...",
  "actions": [
    { "type": "navigate", "summary": "Navigating to pump.fun", "ts": 1234567890 },
    { "type": "trade",    "summary": "Buying 0.1 SOL of $COIN", "ts": 1234567890 }
  ]
}
```

### Auth: how to get the bearer token

The agent's bearer token lives in the calling agent process's environment. It's the same token used by the agent's wallet bridge. Check `api/_lib/auth.js` `authenticateBearer()` — it validates a JWT signed with `JWT_SECRET`. Generate one for an agent owner session.

Alternatively, a new API key system under `api/api-keys.js` already issues bearer tokens — use those.

## Example task: pump.fun coin monitor

```js
// tasks/pump-monitor.js
export async function runPumpMonitor(caster, mint) {
  await caster.navigate(`https://pump.fun/coin/${mint}`);
  
  // Watch for price changes via DOM observation
  await caster.page.exposeFunction('onPriceChange', async (price) => {
    await caster.act('price_update', async () => {
      await caster.pushActivity([{
        type: 'price_update',
        summary: `$${price} — monitoring ${mint.slice(0,8)}…`,
        ts: Date.now(),
      }]);
    });
  });
  
  await caster.page.evaluate(() => {
    const el = document.querySelector('[data-price]');
    if (!el) return;
    const obs = new MutationObserver(() => window.onPriceChange(el.textContent));
    obs.observe(el, { childList: true, subtree: true, characterData: true });
  });
  
  // Keep the session alive
  await new Promise(() => {});
}
```

## `.env.example`

```
AGENT_ID=<uuid>
AGENT_BEARER_TOKEN=<jwt>
PUSH_URL=https://three.ws/api/agent/screen-push
FRAME_INTERVAL_MS=400
JPEG_QUALITY=72
HEADLESS=true
TASK=pump-monitor
TASK_ARG=FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump
```

## Notes

- This service should be a **long-running Node.js process** (not a Vercel function)
- Deploy to a Cloud Run container or a Cloudflare Worker with Durable Objects for persistence
- Playwright's `chromium.launch()` works in Docker — use `mcr.microsoft.com/playwright:v1.x-jammy` as base
- Each Playwright session = one browser context = one agent's "screen"
- Multiple agents can run in the same Node process using separate `AgentScreenCaster` instances
- Frame size: a 1280×720 JPEG at quality 72 is approximately 40–80 KB, well within the 1 MB API limit
- The receiving SSE clients (2D panel, 3D desk) handle 400ms frames gracefully — no need to go faster
- Existing infrastructure: `workers/` contains Cloudflare workers — the screen-caster could also live there as a Durable Object if you want zero-infra hosting

## Where the frames go after pushing

```
AgentScreenCaster.pushFrame()
  → POST /api/agent/screen-push
    → cacheSet('screen:frame:<agentId>', { frame, seq, ts }, 10s TTL)
      → api/agent/screen-stream.js polls every 250ms
        → SSE event: { type: 'frame', frame, seq, ts }
          → src/shared/agent-watch-panel.js renders frame to canvas
          → src/game/agent-desk.js renders frame to THREE.CanvasTexture on monitor mesh
```
