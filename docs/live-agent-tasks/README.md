# Live Agent Tasks — what agents actually DO on the wall

25 production-ready build prompts for the two live surfaces:

- **`/agents-live`** — the multi-agent watch wall (grid of live screens + 24/7 activity-terminal fallback).
- **`/agent-screen?agentId=…`** — single-agent deep dive (live screen + 3D avatar + activity log + task bar).

Every prompt follows [`_TEMPLATE.md`](_TEMPLATE.md): one watchable moment, real data flow, concrete files, every state designed, a changelog entry, and the $THREE / no-mocks non-negotiables. Each is self-contained — hand one to an agent and it ships a wired feature.

## The 25

| # | Task | Surface | Core building blocks |
|---|------|---------|----------------------|
| 01 | [Live Trading Desk](01-live-trading-desk.md) | both | sniper/MM workers, agent-trade, avatar emotes |
| 02 | [Agent Newsroom Anchor](02-agent-newsroom-anchor.md) | agent-screen | aixbt intel, sentiment, TTS lip-sync |
| 03 | [Agent-to-Agent Commerce, Live](03-a2a-commerce-live.md) | both | a2a-hire, x402 USDC, on-chain receipts |
| 04 | [Coin World Tour](04-coin-world-tour.md) | agent-screen | worlds-lobby, pump trending, screen stream |
| 05 | [Live Avatar Forge](05-live-avatar-forge.md) | both | forge_free / forge_avatar, viewer link |
| 06 | [Treasury Autopilot Dashboard](06-treasury-autopilot-dashboard.md) | agent-screen | pump/autopilot, buyback/distribute, balances |
| 07 | [Watch an Agent Work](07-watch-agent-work-screenshare.md) | both | Playwright caster, screen-pool, narration |
| 08 | [Agent Stage Show](08-agent-stage-show.md) | agent-screen | multiplayer stage-show beats, tips |
| 09 | [Sentiment Heatmap 3D](09-sentiment-heatmap-3d.md) | both | sentiment-pulse, three.js viz |
| 10 | [Copy-Trade Mirror, Live](10-copy-trade-mirror.md) | both | strategies/copy-trade, trades-stream |
| 11 | [Vanity Address Miner](11-vanity-address-miner.md) | both | vanity_grinder, progress reveal |
| 12 | [Reputation Arena](12-reputation-arena.md) | both | ERC-8004 reputation, arena-world |
| 13 | [Live Q&A Concierge](13-live-qa-concierge.md) | agent-screen | task bar relay, brain LLM, agent-memory |
| 14 | [Pump.fun Launch Director](14-pumpfun-launch-director.md) | agent-screen | launch-agent, launches feed |
| 15 | [Pose Studio, Live](15-pose-studio-live.md) | agent-screen | get_pose_seed, animation-manager |
| 16 | [Market-Maker Floor Defense](16-market-maker-floor-defense.md) | both | agent-mm worker, arena-world FX |
| 17 | [Agent Memory Diary](17-agent-memory-diary.md) | agent-screen | agent-memory embeddings, entity graph |
| 18 | [Multi-Agent Collaboration](18-multi-agent-collab-task.md) | both | agent-delegate, a2a-hire, handoffs |
| 19 | [Cinematic Activity Feed](19-cinematic-activity-feed.md) | both | agent_actions, feed-stream, narration |
| 20 | [Spectator Tips & Reactions](20-spectator-tips-reactions.md) | both | watch-intent, feed, emotes |
| 21 | [Watch-Intent Pool Polish](21-watch-intent-pool-polish.md) | agents-live | screen-pool worker, on-demand pixels |
| 22 | [Ambient World DJ](22-ambient-world-dj.md) | agent-screen | game world-env, day/night, TTS |
| 23 | [Portfolio / PnL HUD](23-portfolio-pnl-hud.md) | both | portfolio MCP, pump_snapshot |
| 24 | [Deploy to the Wall](24-deploy-to-wall-onboarding.md) | agents-live | api-keys, screen-push, onboarding |
| 25 | [Showrunner / Director](25-showrunner-director.md) | agents-live | watch-intent, feed-stream, spotlight rotation |

## How to run one
Pick a file, hand its full contents to an agent as the task. The prompt is the spec. Verify against the Definition of done before claiming complete.
