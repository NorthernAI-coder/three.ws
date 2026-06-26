# Prompt: Wire Agent Sniper Worker to Agent Screen Stream

## Context

`three.ws` has an agent sniper worker at `workers/agent-sniper/` — a long-lived Node process that snipes pump.fun tokens from an agent's Solana wallet. It already emits detailed logs and positions.

The platform also has a live agent screen system:
- **POST `/api/agent-screen-push`** — push frame or activity text
- **GET `/api/agent-screen-stream?agentId=<uuid>`** — SSE stream viewers subscribe to
- **`pages/agent-screen.html`** — 2D watch view at `/agent-screen?agentId=<uuid>`
- **`src/walk-agent-desk.js`** — 3D desk monitor in /play

Your task: wire the sniper worker to push activity narration (and optionally screenshots) to the screen stream, so viewers watching the agent can see trade decisions play out in real time.

## Files to modify

### `workers/agent-sniper/index.js`

The sniper already has a `log` module. Add a `screenPush` helper that fires alongside log lines.

### `workers/agent-sniper/screen-push.js` (new file)

```js
// screen-push.js — fire-and-forget push to the agent screen stream.
// All pushes are non-blocking: failures are swallowed so they never
// interrupt trading. Import this in index.js and call screenPush()
// alongside existing log() calls.

import fetch from 'node-fetch';

const PUSH_URL = process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push';
const AGENT_JWT = process.env.AGENT_JWT;
const AGENT_ID  = process.env.AGENT_ID;

export function screenPush(activity, type = 'activity') {
  if (!AGENT_JWT || !AGENT_ID) return; // silent no-op if not configured
  const body = JSON.stringify({ agentId: AGENT_ID, frame: { activity, type } });
  fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT_JWT}` },
    body,
  }).catch(() => {}); // fire-and-forget — never block the trade path
}
```

### `workers/agent-sniper/index.js`

Import and call `screenPush` at each significant decision point. The sniper's existing flow:

1. **New mint detected** → `screenPush('New token detected: $SYMBOL — scoring…', 'analysis')`
2. **Score decision** → `screenPush('$SYMBOL scored ${score}/100 — ${score >= threshold ? "BUYING" : "skipping"}', score >= threshold ? 'trade' : 'analysis')`
3. **Buy execution** → `screenPush('Buying $SYMBOL — sending tx…', 'trade')`
4. **Buy confirmed** → `screenPush('Bought $SYMBOL at ${price} SOL — position open', 'trade')`
5. **Position update** → `screenPush('$SYMBOL: ${pnlPct}% P&L — monitoring', 'trade')`
6. **Sell triggered** → `screenPush('Selling $SYMBOL: ${exitReason}', 'trade')`
7. **Sell confirmed** → `screenPush('Sold $SYMBOL — ${pnlPct > 0 ? "profit" : "loss"}: ${pnlSol} SOL', 'trade')`
8. **Error** → `screenPush('Error: ${err.message}', 'activity')`

## Where to add the import

At the top of `workers/agent-sniper/index.js`:
```js
import { screenPush } from './screen-push.js';
```

## Environment variables to add

| Variable | Value |
|---|---|
| `AGENT_JWT` | JWT bearer token for the agent (same user that owns the agent). Get this by logging in as the agent owner and extracting the `Authorization: Bearer <token>` header, or by calling `/api/auth/token` with the owner credentials. |
| `AGENT_ID` | UUID of the sniper agent from the `agents` table |
| `PUSH_URL` | Override: defaults to `https://three.ws/api/agent-screen-push` |

These are additive — existing sniper env vars (`DATABASE_URL`, `PUMPPORTAL_KEY`, etc.) are unchanged.

## Testing

1. Set `AGENT_JWT` and `AGENT_ID` in the sniper's `.env`
2. Run the sniper against devnet: `NETWORK=devnet node index.js`
3. Open `/agent-screen?agentId=<AGENT_ID>` in a browser
4. Within the sniper's first radar sweep you should see activity entries appear in the log panel
5. When a buy fires, the activity type switches to `trade` and the entry highlights green

## Optional: add a terminal-style canvas renderer

If you want the monitor to show a readable terminal feed instead of a blank waiting screen even when no browser is open:

In `screen-push.js`, add a `renderTerminalFrame(lines)` helper that:
1. Creates an offscreen `<canvas>` (1280×720) via `node-canvas` (npm: `canvas`)
2. Draws a dark terminal background with monospace text, the last N activity lines in green/white/yellow
3. Exports as PNG and includes it as `frame.data` in the push

This makes the 3D desk monitor show a live terminal feed — no browser window needed.

```js
import { createCanvas } from 'canvas'; // npm install canvas

const CW = 1280, CH = 720;
const activityLog = [];

export function renderTerminalFrame(newLine) {
  activityLog.push(newLine);
  if (activityLog.length > 18) activityLog.shift();

  const canvas = createCanvas(CW, CH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#06080f'; ctx.fillRect(0, 0, CW, CH);
  ctx.font = '28px monospace';
  activityLog.forEach((line, i) => {
    const age = activityLog.length - 1 - i;
    ctx.fillStyle = age === 0 ? '#fff' : age < 4 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)';
    ctx.fillText(line, 40, 60 + i * 38);
  });
  return 'data:image/png;base64,' + canvas.toBuffer('image/png').toString('base64');
}
```

Then update `screenPush` to include the rendered frame:
```js
export function screenPush(activity, type = 'activity') {
  if (!AGENT_JWT || !AGENT_ID) return;
  const data = renderTerminalFrame(`[${type.toUpperCase()}] ${activity}`);
  const body = JSON.stringify({ agentId: AGENT_ID, frame: { data, activity, type } });
  fetch(PUSH_URL, { method: 'POST', headers: { ... }, body }).catch(() => {});
}
```

This gives you a live terminal screen in both the 2D watch view and the 3D walk desk monitor, rendered from pure Node — no browser needed on the worker side.
