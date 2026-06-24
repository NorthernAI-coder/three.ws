# three.ws MCP buildout — full coverage prompts

Goal: take MCP coverage from the **14 shipped servers** to **100% of three.ws's real backends**. Each file below is a self-contained prompt — open a **new chat**, paste the file's contents, and let the agent build that one server end to end.

## How to run

1. Open a fresh chat in this repo.
2. Paste the **entire contents** of one `NN-*.md` file as your message.
3. The agent will read `_SHARED-CONVENTIONS.md`, the reference packages, and the real API route, then build + test the server.
4. One server per chat keeps context clean. Run them in any order — they don't depend on each other.

Every prompt points at [`_SHARED-CONVENTIONS.md`](_SHARED-CONVENTIONS.md), which encodes the exact package pattern (copied from `packages/intel-mcp`). Read that file first if you want to know what every build has in common.

## The servers (each wraps a real, existing endpoint)

### Tier 1 — the autonomous-agent control plane (highest impact)
| # | Server | Wraps | What it unlocks |
|---|--------|-------|-----------------|
| 01 | `autopilot-mcp` | `api/autopilot/` | An agent setting its own scopes, spend limits, and propose/execute/undo |
| 02 | `portfolio-mcp` | `api/portfolio/`, `api/trades/` | Read/write its own positions, PnL, balances, transfers |
| 03 | `provenance-mcp` | `api/agent-actions.js` | Append-only, signed, on-chain-verifiable action log |
| 04 | `copy-mcp` | `api/copy/` | Manage copy-trade follows + read executions/earnings |
| 05 | `signals-mcp` | `api/signals/`, `api/mirror/` | Discover, subscribe to, and rank trading-signal feeds |
| 06 | `alerts-mcp` | `api/alerts/` | Create/manage pump.fun alert rules + delivery history |

### Tier 2 — account, surface, and discovery
| # | Server | Wraps | What it unlocks |
|---|--------|-------|-----------------|
| 07 | `notifications-mcp` | `api/notifications/`, `api/push/` | Query the inbox, manage prefs, register push devices |
| 08 | `billing-mcp` | `api/billing/` | Self-query quotas, usage rollups, invoices |
| 09 | `activity-mcp` | `api/trending.js`, `api/leaderboard.js`, `api/feed.js` | Trending agents/coins, $THREE holder board, activity ticker |
| 10 | `agenc-mcp` | `api/agenc/` | On-chain task marketplace + agent registry (ERC-8004 coordination) |

### Tier 3 — AI capability surfaces
| # | Server | Wraps | What it unlocks |
|---|--------|-------|-----------------|
| 11 | `vision-mcp` | `api/vision.js` | Image understanding (NVIDIA NIM VLM + fallback) |
| 12 | `brain-mcp` | `api/brain/` | Multi-provider LLM router (Claude / GPT / Qwen / Nemotron …) |
| 13 | `audio-mcp` | `api/a2f.js`, `api/asr.js`, `api/tts/`, `api/mocap/` | Audio-to-face lipsync, speech-to-text, TTS, motion capture |
| 14 | `kol-mcp` | `api/kol/` | Per-wallet KOL portfolio + trade analytics (Birdeye proxy) |

### Tier 4 — product surfaces with real backends
| # | Server | Wraps | What it unlocks |
|---|--------|-------|-----------------|
| 15 | `clash-mcp` | `api/clash/` | Coin Clash faction game state + enlist/rally |
| 16 | `tutor-mcp` | `api/tutor/` | Learning-session ledger (load/close, itemized billing) |
| 17 | `loom-mcp` | `api/loom.js` | 3D creation gallery (feed, submit, fetch) |

## After all 17 ship

Coverage goes from 14 → **31 servers**. The launch story becomes "three.ws is the operating layer for autonomous agents" — they create in 3D, pay per call, run their own portfolio, set their own limits, and prove their own track record on-chain. That's the X article worth writing. (See the discussion that produced these prompts.)

> Note: tool lists in each prompt are **proposed** — the first instruction in every prompt is to read the real route and build against what the code actually exposes. If a backend turns out thinner or richer than described, the agent adapts. No mocks, ever.
