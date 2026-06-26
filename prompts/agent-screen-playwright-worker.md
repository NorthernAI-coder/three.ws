# Prompt: Browser Capture Worker for Agent Screen Stream

## Context

`three.ws` has a live agent screen system. The infrastructure is:

- **POST `/api/agent-screen-push`** — agents push frames here (base64 PNG + activity text)
- **GET `/api/agent-screen-stream?agentId=<uuid>`** — SSE stream that viewers subscribe to
- **`pages/agent-screen.html` + `src/agent-screen.js`** — 2D split-view dashboard (screen left, avatar webcam right)
- **`src/walk-agent-desk.js`** — 3D desk in /play with a CanvasTexture monitor

What's missing: a worker that **actually captures browser screenshots and pushes them** to the system. This prompt is for implementing that worker.

## Your task

Build a long-lived Node.js worker (similar to `workers/agent-sniper/`) that:

1. Launches a **Stagehand** (npm: `@browserbasehq/stagehand`) browser session
2. Drives the browser autonomously (trading, research, browsing, whatever the agent's configured task is)
3. On every meaningful state change (or on a timer), captures a screenshot and pushes it to `/api/agent-screen-push`
4. Also pushes plain-text "activity" narration for each action taken (no screenshot needed, just text)

## Files to create

### `workers/agent-screen-worker/`

```
workers/agent-screen-worker/
  index.js          — entrypoint: boots Stagehand session, runs task loop
  config.js         — env loading + validation
  capture.js        — screenshot capture + push-to-API logic
  task-runner.js    — the autonomous task the agent performs
  package.json
  Dockerfile
  README.md
```

## Implementation details

### `capture.js`

```js
import fetch from 'node-fetch';

const PUSH_URL = process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push';
const AGENT_JWT = process.env.AGENT_JWT; // JWT for the agent that owns the screen

export async function pushFrame({ agentId, page, activity, type = 'screenshot' }) {
  let data = null;
  try {
    // Stagehand exposes page.screenshot() (Playwright under the hood)
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    data = 'data:image/png;base64,' + buf.toString('base64');
  } catch (err) {
    console.warn('[capture] screenshot failed:', err.message);
    type = 'activity'; // degrade to text-only
  }

  const body = { agentId, frame: { data, activity, type } };
  await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${AGENT_JWT}`,
    },
    body: JSON.stringify(body),
  });
}
```

### `index.js`

```js
import { Stagehand } from '@browserbasehq/stagehand';
import { loadConfig } from './config.js';
import { pushFrame } from './capture.js';
import { runTask } from './task-runner.js';

const cfg = loadConfig();

async function main() {
  const stagehand = new Stagehand({
    env: cfg.BROWSERBASE_API_KEY ? 'BROWSERBASE' : 'LOCAL',
    apiKey: cfg.BROWSERBASE_API_KEY,
    projectId: cfg.BROWSERBASE_PROJECT_ID,
    verbose: 1,
  });

  await stagehand.init();
  const page = stagehand.page;
  const context = stagehand.context;

  // Push an initial "booting" frame so the stream lights up immediately
  await pushFrame({ agentId: cfg.AGENT_ID, page, activity: 'Agent starting up…', type: 'activity' });

  // Run the agent's task loop
  await runTask({ stagehand, page, context, cfg, pushFrame });
}

main().catch((err) => {
  console.error('[agent-screen-worker] fatal:', err);
  process.exit(1);
});
```

### `task-runner.js`

```js
// This is where the agent's actual autonomous behaviour lives.
// Replace this template with the specific task (trading, research, etc.)

export async function runTask({ stagehand, page, cfg, pushFrame }) {
  const agentId = cfg.AGENT_ID;

  while (true) {
    try {
      // Example: navigate to pump.fun, observe trending tokens
      await page.goto('https://pump.fun');
      await pushFrame({ agentId, page, activity: 'Scanning pump.fun for trending tokens', type: 'analysis' });

      // Use Stagehand's act() for natural-language browser actions
      const trending = await stagehand.extract({
        instruction: 'Extract the top 5 trending token names and their market caps',
        schema: { tokens: [{ name: 'string', marketCap: 'string' }] },
      });
      await pushFrame({ agentId, page, activity: `Found ${trending.tokens.length} trending tokens`, type: 'analysis' });

      // Trade decision (example)
      const pick = trending.tokens[0];
      await pushFrame({ agentId, page, activity: `Evaluating ${pick.name} — analyzing chart`, type: 'trade' });

      // Sleep between cycles
      await new Promise((r) => setTimeout(r, cfg.CYCLE_MS || 30_000));
    } catch (err) {
      await pushFrame({ agentId, page: null, activity: `Error: ${err.message}`, type: 'activity' });
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
```

### `config.js`

```js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export function loadConfig() {
  const required = ['AGENT_ID', 'AGENT_JWT'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing required env var: ${k}`);
  }
  return {
    AGENT_ID: process.env.AGENT_ID,
    AGENT_JWT: process.env.AGENT_JWT,
    PUSH_URL: process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push',
    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY || '',
    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID || '',
    CYCLE_MS: Number(process.env.CYCLE_MS || 30_000),
  };
}
```

### `package.json`

```json
{
  "name": "agent-screen-worker",
  "type": "module",
  "version": "1.0.0",
  "dependencies": {
    "@browserbasehq/stagehand": "^1.x",
    "node-fetch": "^3"
  }
}
```

### `Dockerfile`

```dockerfile
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Install Playwright browsers for local mode
RUN npx playwright install chromium --with-deps
CMD ["node", "index.js"]
```

## Environment variables needed

| Variable | Description |
|---|---|
| `AGENT_ID` | UUID of the agent that owns the screen stream |
| `AGENT_JWT` | JWT for that agent (from /api/auth or the agent's API key) |
| `PUSH_URL` | Override push endpoint (default: https://three.ws/api/agent-screen-push) |
| `BROWSERBASE_API_KEY` | Optional — use Browserbase cloud instead of local Playwright |
| `BROWSERBASE_PROJECT_ID` | Required if using Browserbase |
| `CYCLE_MS` | Task loop cycle time in ms (default: 30000) |

## Two deployment modes

**Local Playwright** (development / self-hosted):
- Set `env: 'LOCAL'` in Stagehand config
- Docker container runs Chromium via Playwright
- `BROWSERBASE_API_KEY` not needed

**Browserbase cloud** (production / zero-infra):
- Set `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`
- Browser runs in Browserbase's cloud
- Screenshot frames are still pushed to three.ws from the worker process
- No Dockerfile needed — runs as a plain Node process or in a VM

## Wire-up checklist

- [ ] Create `workers/agent-screen-worker/` with the files above
- [ ] Set `AGENT_ID` to an existing agent UUID from the three.ws DB
- [ ] Get `AGENT_JWT` by logging in as the agent owner and grabbing the bearer token from Network tab, or generate one via the agents API
- [ ] Run `npm install && npm start` (local) or `docker build && docker run` (containerized)
- [ ] Open `/agent-screen?agentId=<uuid>` — you should see frames appear within 1–2 seconds of the worker starting
- [ ] The /play world desk will also show the live screen when you walk up to it
