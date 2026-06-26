# Agent Browser Worker — General-Purpose Web Agent with Live Screen Stream

## What this builds

A long-lived Node worker that gives an agent a real browser and streams everything it does back to three.ws so users can watch it work in real time.

The agent receives a task in plain English ("research the best noise-cancelling headphones under $200", "find me flights from NYC to Tokyo in August", "help me understand this research paper", "buy these groceries from Instacart") and executes it using Stagehand — the established JS browser-agent library by Browserbase.

Every action the agent takes (navigate, click, type, extract, scroll) produces a screenshot + narration that streams to `/api/agent-screen-push` and appears live on:
- The agent's profile page watch panel
- `/agent-screen?agentId=<uuid>`
- The 3D walk scene desk monitor

## Stack

| Layer | Tool | Why |
|---|---|---|
| Browser control | [Stagehand](https://github.com/browserbase/stagehand) | Established project. Natural-language act/extract/observe — no CSS selectors. |
| Browser infra | Browserbase (cloud) or local Playwright | Browserbase = zero infra, stealth, residential proxies. Local = free. |
| Agent brain | Claude via existing `/api/chat` | Already wired in the platform — same model that powers everything else. |
| Screen stream | `/api/agent-screen-push` | Already built — just call it after each action. |

## File: `workers/agent-browser-worker/index.js`

```js
import { Stagehand } from '@browserbasehq/stagehand';
import Anthropic from '@anthropic-ai/sdk';
import { pushFrame, pushActivity } from './screen-push.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
const anthropic = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });

async function runTask(task) {
  const stagehand = new Stagehand({
    env: cfg.BROWSERBASE_API_KEY ? 'BROWSERBASE' : 'LOCAL',
    apiKey: cfg.BROWSERBASE_API_KEY,
    projectId: cfg.BROWSERBASE_PROJECT_ID,
    modelName: 'claude-sonnet-4-6',
    modelClientOptions: { apiKey: cfg.ANTHROPIC_API_KEY },
    verbose: 0,
  });

  await stagehand.init();
  const page = stagehand.page;

  await pushActivity(cfg.AGENT_ID, `Starting task: ${task}`);

  // Let Claude plan the task into steps, then execute each step with Stagehand.
  // Claude sees the task + current page state; Stagehand handles browser mechanics.
  const steps = await planTask(task);

  for (const step of steps) {
    await pushActivity(cfg.AGENT_ID, step.narration, 'analysis');

    try {
      if (step.action === 'navigate') {
        await page.goto(step.url, { waitUntil: 'domcontentloaded' });
      } else if (step.action === 'act') {
        await page.act(step.instruction);
      } else if (step.action === 'extract') {
        const result = await page.extract({ instruction: step.instruction, schema: step.schema });
        step.result = result;
      } else if (step.action === 'observe') {
        const observations = await page.observe(step.instruction);
        step.result = observations;
      }

      // Stream the screenshot after every action
      await pushFrame(cfg.AGENT_ID, page, step.narration);

    } catch (err) {
      await pushActivity(cfg.AGENT_ID, `Step failed: ${err.message}`, 'activity');
    }
  }

  const summary = await summarizeResults(task, steps);
  await pushActivity(cfg.AGENT_ID, `Done: ${summary}`, 'analysis');
  await stagehand.close();

  return { summary, steps };
}

async function planTask(task) {
  // Claude breaks the task into browser steps
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a browser agent. Break this task into ordered steps.
Task: ${task}

Respond with a JSON array of steps. Each step has:
- action: "navigate" | "act" | "extract" | "observe"  
- narration: what you're doing in plain English (shown to the user watching)
- url: (for navigate)
- instruction: (for act/extract/observe — natural language, not CSS selectors)
- schema: (for extract — a zod-like object describing what to extract)

Example for "find me a flight NYC to Tokyo in August":
[
  { "action": "navigate", "url": "https://www.google.com/flights", "narration": "Opening Google Flights" },
  { "action": "act", "instruction": "Set origin to New York City", "narration": "Setting departure city to NYC" },
  { "action": "act", "instruction": "Set destination to Tokyo", "narration": "Setting destination to Tokyo" },
  { "action": "act", "instruction": "Click August in the date picker", "narration": "Selecting August travel dates" },
  { "action": "extract", "instruction": "Extract the top 5 flight options with price, airline, and duration", "schema": { "flights": [{ "price": "string", "airline": "string", "duration": "string", "stops": "string" }] }, "narration": "Reading flight results" }
]

Only return valid JSON, nothing else.`,
    }],
  });

  try {
    const text = msg.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [{ action: 'navigate', url: 'https://www.google.com', narration: 'Starting research', instruction: task }];
  }
}

async function summarizeResults(task, steps) {
  const extractions = steps.filter(s => s.result).map(s => JSON.stringify(s.result)).join('\n');
  if (!extractions) return 'Task complete.';

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Summarize in one sentence what was found for this task.\nTask: ${task}\nResults: ${extractions}`,
    }],
  });
  return msg.content[0].text;
}

// ── Main: accept tasks from stdin or a Redis queue ──────────────────────────

// Simple mode: pass a task as a CLI argument
//   node index.js "find the best noise-cancelling headphones under $200"
const taskArg = process.argv[2];
if (taskArg) {
  runTask(taskArg).then(console.log).catch(console.error);
} else {
  // Queue mode: poll Redis for tasks assigned to this agent
  // (wire to /api/agent-actions or your task queue of choice)
  console.log('No task provided. Pass a task as the first argument or wire to a task queue.');
}
```

## File: `workers/agent-browser-worker/screen-push.js`

```js
import fetch from 'node-fetch';

const PUSH_URL = process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push';
const AGENT_JWT = process.env.AGENT_JWT;

export async function pushFrame(agentId, page, activity) {
  let data = null;
  try {
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    data = 'data:image/png;base64,' + buf.toString('base64');
  } catch { /* screenshot failed — degrade to text-only */ }

  return push(agentId, { data, activity, type: data ? 'screenshot' : 'activity' });
}

export async function pushActivity(agentId, activity, type = 'activity') {
  return push(agentId, { activity, type });
}

async function push(agentId, frame) {
  if (!AGENT_JWT) return; // silent no-op if not configured
  try {
    await fetch(PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${AGENT_JWT}`,
      },
      body: JSON.stringify({ agentId, frame }),
    });
  } catch { /* fire-and-forget — never block the task */ }
}
```

## File: `workers/agent-browser-worker/config.js`

```js
export function loadConfig() {
  const required = ['AGENT_ID', 'AGENT_JWT', 'ANTHROPIC_API_KEY'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
  }
  return {
    AGENT_ID: process.env.AGENT_ID,
    AGENT_JWT: process.env.AGENT_JWT,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    PUSH_URL: process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push',
    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY || '',
    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID || '',
  };
}
```

## File: `workers/agent-browser-worker/package.json`

```json
{
  "name": "agent-browser-worker",
  "type": "module",
  "version": "1.0.0",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@browserbasehq/stagehand": "^1.14.0",
    "node-fetch": "^3"
  }
}
```

## Environment variables

| Variable | Description |
|---|---|
| `AGENT_ID` | UUID of the agent (from the agents table) |
| `AGENT_JWT` | Bearer JWT for that agent's owner (grab from browser Network tab after login) |
| `ANTHROPIC_API_KEY` | Existing platform key — already in `.env` |
| `BROWSERBASE_API_KEY` | Optional. Use Browserbase cloud instead of local Chromium. |
| `BROWSERBASE_PROJECT_ID` | Required if using Browserbase. |

## Running it

```bash
# Install
cd workers/agent-browser-worker && npm install

# Run with local Playwright (no Browserbase needed)
AGENT_ID=<uuid> AGENT_JWT=<token> ANTHROPIC_API_KEY=<key> \
  node index.js "research the best noise-cancelling headphones under $200"

# Run with Browserbase (stealth, no local Chrome install needed)
AGENT_ID=<uuid> AGENT_JWT=<token> ANTHROPIC_API_KEY=<key> \
  BROWSERBASE_API_KEY=<key> BROWSERBASE_PROJECT_ID=<id> \
  node index.js "find me flights NYC to Tokyo in August"
```

Open `/agent-screen?agentId=<uuid>` while it runs — you'll see the browser live.

## Task examples to test with

```bash
node index.js "find the current price of NVIDIA stock"
node index.js "search Reddit for what people think about the new MacBook Pro"
node index.js "find 3 good recipes for chicken tikka masala and summarize the key ingredients"
node index.js "check if any flights from Miami to Cancun are under $200 next weekend"
node index.js "find the top 5 trending topics on Hacker News right now"
```

## Next: wiring tasks from the platform

Once the worker runs standalone, wire it to receive tasks from three.ws users:

1. **Via agent chat**: when a user sends the agent a message like "research X", the chat handler posts a task to a Redis queue the worker polls
2. **Via the agent's strategy**: extend `workers/agent-sniper/strategy-store.js` pattern — an agent can have a "browser" strategy that defines what tasks to run on schedule
3. **Via x402 pay-per-task**: a user pays via x402 → the task fires → results come back as agent messages, with the screen stream as proof of work
