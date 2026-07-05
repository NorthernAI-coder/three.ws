# agent-screen-worker

Long-lived Node.js worker that drives a real browser via [Stagehand](https://github.com/browserbasehq/stagehand), captures screenshots on every meaningful state change, and pushes frames to the three.ws live agent screen stream.

## Architecture

```
index.js          boot Stagehand, wire graceful shutdown, start task loop
config.js         env loading + validation
capture.js        screenshot + push-to-API with per-interval throttling
task-runner.js    autonomous task the agent performs (pump.fun scan by default)
```

Frames land at `/api/agent-screen-push` → Redis TTL key → SSE stream at `/api/agent-screen-stream` → rendered by `/agent-screen?agentId=<uuid>` and the 3D desk in `/play`.

## Quick start

### Local Playwright (development)

```bash
cd workers/agent-screen-worker
npm install
export AGENT_ID=<uuid-from-db>
export AGENT_JWT=<bearer-token>
npm start
```

Open `https://three.ws/agent-screen?agentId=<uuid>` — frames appear within seconds.

### Docker (self-hosted)

```bash
docker build -t agent-screen-worker .
docker run --env-file .env agent-screen-worker
```

### Browserbase cloud (production, zero-infra)

No Docker needed. Run as a plain Node process or in any VM:

```bash
export BROWSERBASE_API_KEY=...
export BROWSERBASE_PROJECT_ID=...
export ANTHROPIC_API_KEY=...   # drives page.act()/page.extract() — see below
export AGENT_ID=...
export AGENT_JWT=...
npm start
```

> **`ANTHROPIC_API_KEY` is what makes the agent *do* things.** Stagehand's
> `page.act()` (type, click, submit) and `page.extract()` (read the page) are
> LLM-driven. Without a key the agent still opens the browser, navigates, and
> screenshots — but every interactive step fails. Set it to see the agent
> actually work a task, not just load pages.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AGENT_ID` | yes | — | UUID of the agent that owns this screen stream |
| `AGENT_JWT` | yes | — | Bearer token for that agent |
| `PUSH_URL` | no | `https://three.ws/api/agent-screen-push` | Push endpoint override |
| `BROWSERBASE_API_KEY` | no | — | Browserbase API key (cloud mode) |
| `BROWSERBASE_PROJECT_ID` | no | — | Required when `BROWSERBASE_API_KEY` is set |
| `ANTHROPIC_API_KEY` | recommended | — | Drives `page.act()`/`page.extract()`. Without it the agent navigates + screenshots but can't type, click, or read pages. |
| `STAGEHAND_MODEL` | no | `anthropic/claude-opus-4-8` | Model for act/extract. Keep the `anthropic/` prefix (routes to Stagehand's Anthropic client). Use `anthropic/claude-haiku-4-5` for cheaper, faster casting at high volume. |
| `CYCLE_MS` | no | `30000` | Task loop cycle time in ms |
| `SCREENSHOT_INTERVAL_MS` | no | `5000` | Minimum ms between full screenshots (text-only pushes fill the gap) |

## Customising the task

Edit `task-runner.js`. The default task scans pump.fun for trending tokens and narrates findings. Replace or extend `runTask()` for your agent's actual mission.

The `push()` helper accepts `type` values that control how the dashboard styles the entry:

| type | meaning |
|---|---|
| `screenshot` | Full frame — triggers a screenshot if interval has elapsed |
| `activity` | Text-only log entry |
| `trade` | Trade-related event (styled differently in the log) |
| `analysis` | Research / analysis step |

## Dockerfile build args

| Arg | Default | Description |
|---|---|---|
| `SKIP_BROWSERS` | `0` | Set to `1` to skip `playwright install` (Browserbase-only deployments) |
