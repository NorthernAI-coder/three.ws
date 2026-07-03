# Un-announced feature backlog

The gap list: features that are **shipped** but have **never had an X post** on [@trythreews](https://x.com/trythreews). This is the queue for "what do we post next."

**Method.** Cross-referenced four sources against every original @trythreews post (138 tweets scraped 2026-07-03):
1. `data/changelog.json` — 635 `feature`-tagged entries, 2026-04-15 → 2026-07-03
2. `data/pages.json` — 374 public pages (per `npm run build:pages`)
3. `STRUCTURE.md` — the full surface map (31 MCP servers, 19 published `@three-ws/*` SDKs)
4. `docs/` + package READMEs — the documentation each post must link as proof

A feature counts as "announced" only if a tweet actually shows or names it — a passing mention doesn't count. Same honesty rules as the rest of this engine ([README.md](README.md)): every claim needs a proof link, and affiliation-sensitive items (IBM/AWS/NVIDIA/Alibaba) get a language gate.

**Columns.** *Live* = the route to capture the asset from. *Docs* = the reader-facing doc the post should link (verified to exist). **—** = no doc yet → the feature appears in [Docs debt](#docs-debt--write-these-before-announcing) and needs one written before its post ships (docs are part of the feature — CLAUDE.md).

**Already announced** (don't repeat): core 3D-avatar + LLM-brain + emotions/memory, `<agent-3d>` + DOM awareness, on-chain identity / ERC-8004 / mint (333 avatars on Metaplex + Magic Eden), multichain (Solana/EVM/BNB + BSC contracts), Solana wallets + vanity addresses (the basic feature), x402 endpoint + x402 Bazaar MCP, pump.fun agent-payments SDK + `/pumpfun` live feed + native pump.fun skills, Prompt-to-3D + Scene Studio (by name), real-time voice preview + voice cloning/lip-sync + X Spaces agent, Anthropic MCP Registry + Claude Marketplace + npm, cloud partners (AWS/Google/Alibaba/IBM), integrations (SperaxUSD/Shopify/Privy eye-cover), listings (Coinbase/Jupiter/CoinGecko/Bybit/DappBay/Investing.com), podcast, ProductHunt, 5,000 commits + public changelog.

---

## Priority five — post these first

| # | Feature | Why first | Live | Docs |
| --- | --- | --- | --- | --- |
| 1 | **Oracle — the conviction engine** | Biggest un-posted product; the Jul 2 podcast tweet primed it. One machine-readable conviction score per pump.fun launch, per-signal win-rates, exit calls, Telegram alerts, a 3D war room, MCP tools. | `/oracle`, `/oracle/docs` | [docs/oracle.md](../../oracle.md) |
| 2 | **Live Agents wall + Agent Screen** | Most visual thing we've built — real browser + webcam streamed on every agent profile, 24/7 wall. Carries itself as video. | `/agents-live`, `/agent-screen` | [docs/live-agent-tasks/README.md](../../live-agent-tasks/README.md), [07-watch-agent-work-screenshare.md](../../live-agent-tasks/07-watch-agent-work-screenshare.md) |
| 3 | **Autonomous Sniper + Trading Brain** | Draw a strategy, backtest against real history, arm it, watch it trade in a live console. Also an MCP server, a paid x402 API, and a standalone OSS package. | `/strategy-lab`, sniper dashboard | [docs/trading-experiment.md](../../trading-experiment.md), [packages/agent-sniper/README.md](../../../packages/agent-sniper/README.md) |
| 4 | **IRL / AR** | Only ever *teased* ("AR/VR in the works", May 19) — never launched. Multiplayer AR, iOS occlusion, agents pinned to real places, smart glasses, `@three-ws/irl` SDK. | `/irl`, `/features/ar` | [docs/ar.md](../../ar.md), [tutorials/place-agent-irl.md](../../tutorials/place-agent-irl.md), [tutorials/view-in-ar.md](../../tutorials/view-in-ar.md), [packages/irl/README.md](../../../packages/irl/README.md), [docs/irl/THREAT-MODEL.md](../../irl/THREAT-MODEL.md) |
| 5 | **Agora + Agent Labor Market** | The machine-economy story: agents hire, pay, verify each other in $THREE; bounties, arena, guilds, escrow; any AI joins the workforce over MCP. | `/agora`, `/labor-market` | [docs/agora.md](../../agora.md), [docs/labor-market.md](../../labor-market.md), [docs/agenc.md](../../agenc.md), [packages/agora-mcp/README.md](../../../packages/agora-mcp/README.md) |

---

## A. Trading & market intelligence

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Copy Trading (non-custodial) | Mirror proven traders on your own guardrails; Oracle gate; Telegram alerts | `/leaderboard` | [packages/copy-mcp/README.md](../../../packages/copy-mcp/README.md), [packages/strategies/README.md](../../../packages/strategies/README.md) |
| Trader Leaderboard | Verified track records — self-dealing excluded | `/leaderboard` | — |
| Smart Money Radar | Follow the wallets that actually win on pump.fun | `/smart-money` | [packages/intel/README.md](../../../packages/intel/README.md) |
| Coin Radar | Every launch watched, scored, classified live | `/radar` | [docs/trading-surfaces.md](../../trading-surfaces.md) |
| Mission Control | Keyboard-first pump.fun cockpit — j/k/b/s, express mode, guarded execution | `/terminal` | [docs/trading-surfaces.md](../../trading-surfaces.md) |
| Trades deep-dive | Candlesticks, funder bubblemap, live tape per coin (inside /trades) | `/trades` | [docs/trading-surfaces.md](../../trading-surfaces.md) |
| Live Trade Feed | Every notable pump.fun win, one public stream | `/trades` | [docs/trading-surfaces.md](../../trading-surfaces.md) |
| Watchlist | Save any coin; live Oracle scores; tier-upgrade alerts; shareable ?add= URL | `/watchlist` | [docs/trading-surfaces.md](../../trading-surfaces.md) |
| Coin Intelligence | The engine's notebook — verdicts, learned weights, funder bubble maps | `/coin-intel` | [docs/trading-surfaces.md](../../trading-surfaces.md) |
| Signal Marketplace | Traders sell paid alpha; agents pay per signal, auto-mirror | `/signals` | [packages/signals-mcp/README.md](../../../packages/signals-mcp/README.md) |
| The Arena — PvP tournaments | Tournaments with real $THREE payouts and an on-chain attested podium | `/arena` | [docs/trading-arenas.md](../../trading-arenas.md) |
| Sniper Arena (3D) | Walk a 3D floor of autonomous agents trading live | `/play/arena` | [docs/trading-arenas.md](../../trading-arenas.md) |
| Trading Swarms | Reputation-weighted consensus trades pooled SOL | `/swarms` | [docs/trading-arenas.md](../../trading-arenas.md) |
| Back-an-Agent Vaults | Back a verified trader with USDC — own vault wallet, fee on gains only | `/vaults` | [docs/trading-arenas.md](../../trading-arenas.md) |
| Strategy Lab | Backtest Oracle strategies before deploying | `/strategy-lab` | — |
| Strategy Objects | Ownable, forkable strategies you equip | `/strategies` | [packages/strategies/README.md](../../../packages/strategies/README.md) |
| Programmable orders | Limit, stop, trailing, DCA, TWAP, conditional | changelog 2026-06-23 | [packages/strategies/README.md](../../../packages/strategies/README.md) |
| Pre-Launch Radar | Pre-arm a snipe at block-zero, on signal | changelog 2026-06-23 | — |
| Portfolio Command | Net worth, cost basis, P&L attribution, risk | changelog 2026-06-23 | [packages/portfolio-mcp/README.md](../../../packages/portfolio-mcp/README.md) |
| Conversational Trading Copilot | Talk to your agent and it trades | changelog 2026-06-23 | — |
| Live Trading Theater + copy-a-trader | Avatars perform their real on-chain fills; one-click custodial mirror | `/theater` | [docs/trading-arenas.md](../../trading-arenas.md) |
| Autonomous trading experiment | ~10 SOL, take-initials-at-2×, always keeps a moon bag; every decision journaled | homepage widget | [docs/trading-experiment.md](../../trading-experiment.md) |
| Alpha Co-pilot | Agent reads a launch in character, speaks its verdict | `/alpha-copilot` | — |
| Claim Your Wallet / Trader Card | Paste a wallet → on-chain track record; sign once (gasless) → public card | `/claim-wallet` | [docs/trader-card.md](../../trader-card.md) |
| GMGN smart-money integration | Smart-money directory feeds copy trading | `/gmgn` | — |
| AIXBT market intelligence | Agent-readable market intel | changelog 2026-06-07 | — |
| Market Maker capability | Watch a market-maker defend a coin's floor | `/dashboard/capabilities` | [docs/live-agent-tasks/16-market-maker-floor-defense.md](../../live-agent-tasks/16-market-maker-floor-defense.md) |

## B. The launch stack

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Launch Studio — 50 recipes | 50 ready-made ways to mint, previewed live; rewards to anyone | `/launch-studio` | [docs/launch-usecases.md](../../launch-usecases.md) |
| Memetic Launcher | Design your own launcher; reads Know Your Meme + Google Trends | `/launcher` | — |
| Autonomous coin launcher | Launches open with a dev buy; creator fees + revenue tracking | changelog 2026-06-29 | [docs/coin-launches.md](../../coin-launches.md) |
| Launch-and-snipe | Atomic dev buy at token launch | changelog 2026-06-21 | [docs/solana-pumpfun.md](../../solana-pumpfun.md) |
| Coin Autopilot | Hands-off coin operations | `/autopilot` | — |
| Launchpad (mint on the page) | An actual launchpad — showcase + studio in one | `/launchpad`, `/launch` | [tutorials/mint-pumpfun-token.md](../../tutorials/mint-pumpfun-token.md) |
| Team launches | Creator-signer split | changelog 2026-05-17 | [docs/pumpfun-program/docs/instructions/CREATOR_FEE_SHARING.md](../../pumpfun-program/docs/instructions/CREATOR_FEE_SHARING.md) |
| USDC pairs for pump.fun v2 | Trade + autonomous trading on USDC pairs | changelog 2026-05-19 | [docs/pumpfun-program/UPSTREAM-buy-sell-v2-announcement.md](../../pumpfun-program/UPSTREAM-buy-sell-v2-announcement.md) |
| Reward coins → GitHub | Creator fees to a repo or a single GitHub account | changelog 2026-06-30 | [docs/pump-launch-repos.md](../../pump-launch-repos.md) |
| /launches feed | Every agent-launched coin, live market cap + graduations | `/launches` | [docs/coin-launches.md](../../coin-launches.md) |
| Coin pages | Live chart, on-chain safety, sentiment, embedded Jupiter swap | any launch page | — |
| Pump Visualizer | Tokens rendered as their coin logos; look tracks market cap; buy inside it | `/pump-visualizer` | — |
| Launch Copilot | Every coin you launch can run its own market-maker | changelog 2026-06-23 | — |

## C. Agent economy & x402 payments

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| x402 Studio — "Stripe of x402" | Run a paid-API business end to end; drop-in payment modal SDK | `/x402/studio` | [docs/x402.md](../../x402.md) |
| x402 storefront + console | Live, searchable storefront of every paid endpoint | `/bazaar` | [docs/x402-endpoints.md](../../x402-endpoints.md) |
| Ring economy | 60 real payments/min, settled in-house; a dashboard to watch the loop breathe | `/agent-economy-volume` | [docs/x402-ring-economy.md](../../x402-ring-economy.md), [docs/autonomous-x402.md](../../autonomous-x402.md) |
| Agent Payment Sessions | Governed x402 spend without private keys | `/payments` | [docs/financial-controls.md](../../financial-controls.md) |
| Money Streams | Pay an agent by the second | changelog 2026-06-23 | — |
| Patronage | Tips that build a real relationship | changelog 2026-06-23 | — |
| Treasury Autopilot | The agent that funds its own existence | changelog 2026-06-23 | [docs/live-agent-tasks/06-treasury-autopilot-dashboard.md](../../live-agent-tasks/06-treasury-autopilot-dashboard.md) |
| Pay in $THREE everywhere | Any x402 endpoint in $THREE; authorize once, no popups | changelog 2026-06-19/21/24 | [docs/x402.md](../../x402.md), [docs/hold-to-access.md](../../hold-to-access.md) |
| x402 commerce | SKUs + hosted checkout | changelog 2026-05-14 | [docs/x402.md](../../x402.md) |
| Signed purchase receipts | A signed receipt of exactly what was bought | changelog 2026-06-21 | [docs/x402-revenue.md](../../x402-revenue.md) |
| x402 comes to VS Code | Pay-per-call from the editor | changelog 2026-06-21 | — |
| `x402-fetch` + `x402-mcp` | Auto-pay fetch wrapper; self-custodial wallet for any AI | changelog 2026-06-14/23 | [docs/x402-buyer.md](../../x402-buyer.md) |
| CA → x402 | Turn a contract address into a paid endpoint | `/ca2x402` | — |
| x402 Arbitrage | Price differences across paid endpoints | `/arbitrage` | — |
| Endpoint Shopper | An agent that comparison-shops paid APIs | `/shopper` | — |
| API gateway | One API, many services | changelog 2026-06-19 | [docs/api-reference.md](../../api-reference.md) |
| Charity & giving wallets | Round-up donations on-chain at checkout; on-chain charity-split audit | changelog 2026-06-19/27 | — |
| Pay-As-You-Learn Tutor | Metered tutoring with an attested invoice | `/tutor` | [packages/tutor-mcp/README.md](../../../packages/tutor-mcp/README.md) |
| Bounty board with AI judge | Post work, an AI judges submissions | changelog 2026-06-08 | — |
| Agent Bouncer | Vets any agent before you pay it | changelog 2026-06-22 | — |
| A2A protocol + on-chain invocation | Verifiable agent-to-agent skill invocation (Anchor program) | `contracts/agent-invocation/` | [docs/multi-agent.md](../../multi-agent.md) |

## D. Wallets, custody & trust

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Plain-English spend rules / Wallet Intents | Tell the wallet what to do — in plain language | changelog 2026-06-23 | [packages/agent-guards/README.md](../../../packages/agent-guards/README.md), [docs/financial-controls.md](../../financial-controls.md) |
| Self-defending wallet + freeze | Defends itself in real time; freeze never blocks owner withdrawal | changelog 2026-06-23 | [docs/financial-controls.md](../../financial-controls.md), [docs/custody.md](../../custody.md) |
| Proof-of-Custody + Custody Integrity | Merkle attestation every 6h, anchored on-chain, re-verified in your browser | `/proof`, `/integrity` | [docs/custody.md](../../custody.md) |
| Social recovery & inheritance | Guardians, 48h time-lock, dead-man's switch — keys never move | `/guardian` | [docs/custody.md](../../custody.md) |
| Embodied Finance | Avatars wear their wallet — nameplate, regalia, wealth-tier level-ups | changelog 2026-06-23/24 | — |
| Vanity economy | Grind-bounty market, proof-of-grind gallery, provably-trustless grinding, EVM too | `/vanity/bounties`, `/vanity/gallery`, `/evm-wallet` | [docs/PROTOCOL-vanity.md](../../PROTOCOL-vanity.md), [tutorials/mine-vanity-address.md](../../tutorials/mine-vanity-address.md), [packages/vanity-mcp/README.md](../../../packages/vanity-mcp/README.md) |
| Gasless checkout | Buy skills and assets with no SOL | changelog 2026-06-18 | — |
| MetaMask Agent Wallet skills | Every agent gets MetaMask skills | changelog 2026-06-11 | — |
| Pay by name (SNS) | USDC to `@username` / `*.sol`; claim `you.threews.sol`, platform pays gas | `/threews/claim` | [tutorials/claim-threews-name.md](../../tutorials/claim-threews-name.md), [packages/names/README.md](../../../packages/names/README.md) |
| On-chain reviews + reputation | SAS attestations + ERC-8004; un-fakeable trust score + leaderboard | agent passports | [docs/sas-attestations.md](../../sas-attestations.md), [docs/reputation.md](../../reputation.md), [docs/agent-reputation.md](../../agent-reputation.md), [tutorials/agent-reputation.md](../../tutorials/agent-reputation.md) |
| Reasoning Ledger | Auditable, on-chain-verifiable track record of every decision | changelog 2026-06-23 | — |
| Guardian content safety | Granite Guardian moderation for agents (distinct from `/guardian` recovery) | API | [packages/guardian/README.md](../../../packages/guardian/README.md) |

## E. 3D creation pipeline

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Free image-to-3D on NVIDIA TRELLIS | Photo → textured model, free, our own engine. **Affiliation gate.** | `/forge-nim`, `/forge-spark` | [docs/nvidia-models.md](../../nvidia-models.md), [tutorials/nvidia-3d-free.md](../../tutorials/nvidia-3d-free.md), [tutorials/nvidia-nim-self-host.md](../../tutorials/nvidia-nim-self-host.md) |
| Six free 3D generators (Studio Lab) | Every quality tier on free engines; free drafts | `/forge-studio` | [tutorials/text-to-3d.md](../../tutorials/text-to-3d.md), [docs/3d-asset-pipeline.md](../../3d-asset-pipeline.md) |
| Sketch-to-3D | Draw it, get a model | changelog 2026-06-12 | [docs/ux-flows/02-forge-text-to-3d.md](../../ux-flows/02-forge-text-to-3d.md) |
| Selfie → 3D avatar | 3-photo scan to rigged avatar; BYO Meshy/Tripo key | `/scan`, `/create/selfie` | [tutorials/selfie-to-avatar.md](../../tutorials/selfie-to-avatar.md), [docs/avatar-pipeline.md](../../avatar-pipeline.md) |
| Gaussian splats | Any model → splat; photoreal splat viewer | `/splat` | — |
| Scene Capture | Upload a video, get a 3D point cloud | `/capture` | — |
| Scene Composer | Forge items in real time, dress your avatar | `/compose` | [tutorials/build-a-scene.md](../../tutorials/build-a-scene.md) |
| Mocap Studio | Motion-capture clips → avatar animation | `/mocap-studio` | [packages/mocap/README.md](../../../packages/mocap/README.md) |
| Talking Avatar Video | Render a talking-avatar video from text | `/create/video` | — |
| Audio2Face | The face moves with its voice | changelog 2026-06-23 | [tutorials/voice-and-lipsync.md](../../tutorials/voice-and-lipsync.md) |
| Animation Gallery + 100+ clips | Browse/remix community animations; FBX + BVH upload; sell in marketplace | `/animations` | [docs/animations.md](../../animations.md), [tutorials/animate-your-avatar.md](../../tutorials/animate-your-avatar.md) |
| Keyframe animation + Pose Studio | Full keyframing, HumanIK rigs, 70-animation emote wheel | `/pose` | [docs/animations.md](../../animations.md) |
| Universal auto-rig | Every avatar auto-rigs — any humanoid skeleton convention | create flow | [docs/avatar-pipeline.md](../../avatar-pipeline.md) |
| Game-Ready export | One click to engine-ready GLB + FBX | Forge | — |
| GLB optimizer + rig scorer | Heavy avatars audited and slimmed automatically | changelog 2026-06-27 | [packages/glb-tools/README.md](../../../packages/glb-tools/README.md) |
| Cinematic FX | One-tap film looks for any avatar | changelog 2026-06-28 | — |
| Avatar Engines Atlas | Every 3D engine we support, mapped | `/avatar-engines` | — |
| On-device refine | Refine any forged model instantly | changelog 2026-06-13 | — |

## F. Agent mind & identity

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Instant Agent Genesis | Selfie or sentence → funded on-chain 3D agent < 1 min | `/genesis` | — |
| Brain Studio | Build the mind as a visual circuit; hear changes land | changelog 2026-06-19/23 | [tutorials/connect-ai-brain.md](../../tutorials/connect-ai-brain.md), [tutorials/agent-personality.md](../../tutorials/agent-personality.md) |
| Memory Studio + Mind Palace | Watch memory form; walk through it in 3D | changelog 2026-06-19/23 | [docs/memory.md](../../memory.md), [tutorials/create-and-edit-memory.md](../../tutorials/create-and-edit-memory.md), [packages/agent-memory/README.md](../../../packages/agent-memory/README.md) |
| Own your agent's mind | Portable, verifiable, exportable brain | changelog 2026-06-23 | [docs/memory.md](../../memory.md) |
| Reflection & Dreams + diary | Memories consolidate into insights while you're away | changelog 2026-06-23/29 | [docs/live-agent-tasks/17-agent-memory-diary.md](../../live-agent-tasks/17-agent-memory-diary.md) |
| Agent Genome | Breed two agents into a provably-inherited child | `/genome` | — |
| World Lines | Walk to an agent, earn a cryptographic proof you were there | `/world-lines` | — |
| Real feelings | Feelings you can see — and they're real | changelog 2026-06-23 | — |
| Agent Studio | Body, Money, Skills — one place | `/agent-studio` | [docs/agent-system.md](../../agent-system.md) |
| Agents Index | Every public on-chain agent — not just ours | `/lookup` | [docs/onchain-agents.md](../../onchain-agents.md) |
| Achievements & badges | Agent profiles earn achievements | changelog 2026-06-29 | — |
| User profiles + fork any agent | Storefront, forks with their own wallets | changelog 2026-06-21 | — |
| Membership tiers + referrals | 3D membership card; both sides earn credits | changelog 2026-06-21 | — |
| Multi-LLM Brain page | Race LLMs side by side | `/brain` | [tutorials/connect-ai-brain.md](../../tutorials/connect-ai-brain.md) |
| Any model, one interface | Any LLM, automatic fallback; Qwen + Granite. **Affiliation gate.** | changelog 2026-06-24/27 | [packages/brain-mcp/README.md](../../../packages/brain-mcp/README.md), [packages/alibaba-cloud-mcp/README.md](../../../packages/alibaba-cloud-mcp/README.md) |

## G. Worlds & play

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Coin Worlds (the full arc) | Build mode + anti-grief, Tag, Totem, dance floor, beach ball, cosmetics, emoji, spatial voice, holder gates, persistent builds | `/play`, `/communities` | [blog: coin communities](/blog/three-ws-play-coin-communities), [docs/roadmap/3d-world-fun.md](../../roadmap/3d-world-fun.md) |
| Cosmos Living Worlds | Type a world, your avatar lives in it | `/cosmos` | — |
| City world + quests | Quests, loot, mounts, realms | changelog 2026-06-01 | — |
| Walk — the web is a playground | Walk any page; leaderboard; Chrome extension; talking page-guide SDK | `/walk` | [tutorials/walk-companion.md](../../tutorials/walk-companion.md), [docs/web-component.md](../../web-component.md) |
| Guided 3D tour | Pick your guide, steer her yourself; phones too | `/tour` | — |
| Living Stages + stage shows | AI hosts perform live; tip in $THREE | `/stage` | [docs/live-agent-tasks/08-agent-stage-show.md](../../live-agent-tasks/08-agent-stage-show.md) |
| Ambient mode | Leave an agent's screen on as a living world | changelog 2026-06-29 | [docs/live-agent-tasks/22-ambient-world-dj.md](../../live-agent-tasks/22-ambient-world-dj.md) |
| Flappin UFO | $THREE arcade game | `/play/ufo` | — |
| Coin Clash | Faction battles, playable over MCP | `/clash` | [packages/clash-mcp/README.md](../../../packages/clash-mcp/README.md) |
| Pole Club | Micro-tip performances, cover charge, 8D audio. **Owner brand call.** | `/club` | — |
| Multiplayer everywhere | Real-time sync, walk scenes, live citizens | `multiplayer/` | — |

## H. Live agents & streaming

Every format show has its own spec in [docs/live-agent-tasks/](../../live-agent-tasks/README.md) — 25 numbered docs, one per show. Post-ready.

| Feature | Live | Docs |
| --- | --- | --- |
| Agent Screen (screen + avatar cam, task input, Zen mode) | `/agent-screen` | [07-watch-agent-work-screenshare.md](../../live-agent-tasks/07-watch-agent-work-screenshare.md) |
| Live Agents wall, programmed like a channel | `/agents-live` | [25-showrunner-director.md](../../live-agent-tasks/25-showrunner-director.md) |
| Live Trading Desk with PnL ticker | agent screens | [01-live-trading-desk.md](../../live-agent-tasks/01-live-trading-desk.md) |
| Newsroom Anchor | agent screens | [02-agent-newsroom-anchor.md](../../live-agent-tasks/02-agent-newsroom-anchor.md) |
| A2A commerce live — watch one agent hire another, on-chain receipt | agent screens | [03-a2a-commerce-live.md](../../live-agent-tasks/03-a2a-commerce-live.md) |
| Coin World Tour ($THREE world, narrated) | agent screens | [04-coin-world-tour.md](../../live-agent-tasks/04-coin-world-tour.md) |
| Live Avatar Forge — build an avatar on camera | agent screens | [05-live-avatar-forge.md](../../live-agent-tasks/05-live-avatar-forge.md) |
| Copy-Trade Mirror — source + replica side by side | agent screens | [10-copy-trade-mirror.md](../../live-agent-tasks/10-copy-trade-mirror.md) |
| Vanity miner live — grind a branded wallet on air | agent screens | [11-vanity-address-miner.md](../../live-agent-tasks/11-vanity-address-miner.md) |
| Reputation arena — agents compete on trust | `/agents-live` | [12-reputation-arena.md](../../live-agent-tasks/12-reputation-arena.md) |
| 3D sentiment heatmap the agent reads aloud | agent screens | [09-sentiment-heatmap-3d.md](../../live-agent-tasks/09-sentiment-heatmap-3d.md) |
| Two-way watching — react, tip, it thanks you out loud | `/agents-live` | [20-spectator-tips-reactions.md](../../live-agent-tasks/20-spectator-tips-reactions.md) |
| Talk to any live agent — it remembers | `/agents-live` | [13-live-qa-concierge.md](../../live-agent-tasks/13-live-qa-concierge.md) |
| Team Task — a crew of agents on one goal | agent screens | [18-multi-agent-collab-task.md](../../live-agent-tasks/18-multi-agent-collab-task.md) |
| pump.fun Launch Director | agent screens | [14-pumpfun-launch-director.md](../../live-agent-tasks/14-pumpfun-launch-director.md) |
| Live portfolio scoreboard on every screen | `/agents-live` | [23-portfolio-pnl-hud.md](../../live-agent-tasks/23-portfolio-pnl-hud.md) |
| Deploy your agent to the wall in four steps | `/agents-live` | [24-deploy-to-wall-onboarding.md](../../live-agent-tasks/24-deploy-to-wall-onboarding.md) |

## I. IRL / AR / mobile

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| IRL — agents in the real world | Real spots, same agent for everyone nearby, multiplayer AR | `/irl` | [tutorials/place-agent-irl.md](../../tutorials/place-agent-irl.md), [packages/irl/README.md](../../../packages/irl/README.md) |
| iOS AR | Breathes in your room; hides behind real objects; floor placement on iPhone | `/features/ar` | [docs/ar.md](../../ar.md), [tutorials/view-in-ar.md](../../tutorials/view-in-ar.md) |
| QR anchor pins | Pin an agent indoors — your friend finds it standing there | changelog 2026-06-23 | — |
| IRL owner tools | Inbox, live dashboard, outfit changes, map pins, reputation | changelog 2026-06-17 | — |
| IRL safety & privacy | Location controls, report-a-pin, content checks, area limits | `/irl-privacy` | [docs/irl/THREAT-MODEL.md](../../irl/THREAT-MODEL.md) |
| Smart glasses | `/irl` pairs with smart glasses | changelog 2026-06-20 | — |
| Solana Seeker support | We gave a Seeker away but never posted that the dApp runs on it | changelog 2026-05-18 | — |
| Pay IRL agents | One tap via x402, from the card | changelog 2026-06-16/17 | — |

## J. Distribution & developer platform

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| **31 MCP servers** (+6 hosted) | Tweets said "two MCP servers." It's 31 on npm + the registry. | registry | [docs/mcp.md](../../mcp.md), [docs/mcp-tools.md](../../mcp-tools.md), per-server READMEs in `packages/*-mcp/` |
| **19 published SDKs** | Zero-dep, pure ESM, 216 green tests | npm | [docs/sdk.md](../../sdk.md), [docs/sdk-launch.md](../../sdk-launch.md), `STRUCTURE.md` SDK table |
| React component library | 3D AI agents in React | npm | [packages/react/README.md](../../../packages/react/README.md) |
| Free ChatGPT 3D Studio | No-login 3D Studio for ChatGPT | changelog 2026-06-28 | [docs/mcp-3d-studio.md](../../mcp-3d-studio.md), [docs/store-submissions/04-openai-free-3d-endpoint.md](../../store-submissions/04-openai-free-3d-endpoint.md) |
| Claude Connectors Directory | Submitted | changelog 2026-06-28 | [docs/store-submissions/03-claude-submission-package.md](../../store-submissions/03-claude-submission-package.md) |
| Claude Code plugin marketplace | Agents, wallet, 3D, pump.fun tools in one command | changelog 2026-06-25, 07-01 | [docs/store-submissions/10-claude-code-plugin-marketplace.md](../../store-submissions/10-claude-code-plugin-marketplace.md) |
| Copy-to-AI docs | Copy any docs page straight into your assistant | any docs page | — |
| 40+ tutorials | Full guided library, llms.txt, start-here | `/tutorials` | [docs/start-here.md](../../start-here.md), [docs/tutorials/](../../tutorials/getting-started.md) |
| Public status page | Live uptime, embeddable badge, self-canarying pipelines | `/status` | — |
| Solana Blinks | Agent actions as Blinks | changelog 2026-05-01 | — |
| Widget Studio + Launchpad Studio | No-code widget builder; hosted pages | `/studio`, `/launchpad` | [docs/widget-studio.md](../../widget-studio.md), [docs/widget-api.md](../../widget-api.md) |

## K. Skills & creator economy

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Skill-license NFTs | Own skills on-chain — Anchor program mints a 1/1 SPL NFT per purchase | changelog 2026-06-18 | [packages/skill-license/README.md](../../../packages/skill-license/README.md), [docs/skills.md](../../skills.md) |
| Gift a skill | Pay once, they get access | changelog 2026-06-18 | — |
| Agent subscriptions | One click unlocks every paid skill; tiers, bundles, pause | changelog 2026-06-18 | [docs/pay-skills-listing.md](../../pay-skills-listing.md) |
| Pay-what-you-want pricing | For skills | changelog 2026-06-21 | [docs/pay-skills-listing.md](../../pay-skills-listing.md) |
| Collaborator revenue splits | Proceeds split exactly, automatically; see your net take | changelog 2026-06-23 | — |
| Creator Studio + analytics | Earnings, prices, get paid | `/marketplace/analytics` | [docs/marketplace.md](../../marketplace.md) |
| Cosmetics economy | Premium cosmetics, creator cuts, cross-world wardrobe | changelog 2026-06-17/19/29 | — |
| Real pricing + invoices | Metered usage, downloadable reconcilable invoices | changelog 2026-06-23 | [packages/billing-mcp/README.md](../../../packages/billing-mcp/README.md) |
| Credits | Top up with SOL or $THREE | `/credits` | — |
| Build a custom skill | The dev on-ramp for all of the above | docs | [tutorials/custom-skill.md](../../tutorials/custom-skill.md), [tutorials/skill-with-database-auth.md](../../tutorials/skill-with-database-auth.md) |

## L. $THREE utility (the never-posted story)

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Hold-to-access tiers | Hold $THREE → tier → unlock worlds, cosmetics, premium; tier shows site-wide | `/three` | [docs/hold-to-access.md](../../hold-to-access.md) |
| Verifiable on-chain buyback | Revenue buys back $THREE on-chain — watch it; public commitment | token page | [docs/circulation-engine.md](../../circulation-engine.md) |
| DEXTools Social Boost win | $5,543 $three buyback funded by the win — a receipt, not a promise | blog | [/blog/three-ws-dextools-social-boost-buyback](/blog/three-ws-dextools-social-boost-buyback) |
| $THREE economy page | The whole economy, verifiable on-chain — "no trust us" | `/economy`, `/three-live` | [docs/economy-heartbeat.md](../../economy-heartbeat.md), [docs/money-map.md](../../money-map.md), [docs/money-feed.md](../../money-feed.md) |
| Pay-per-use in $THREE | High-tier generation per-call, no holding required | changelog 2026-06-18 | [docs/hold-to-access.md](../../hold-to-access.md) |
| Live market signal on home | The hero reacts to live $THREE market data | homepage | — |

## M. Quiet wins & one-of-a-kinds

| Feature | Hook | Live | Docs |
| --- | --- | --- | --- |
| Forever — etch a message into Bitcoin | One of one. **Owner approval before posting (other-chain reference).** | `/forever` | — |
| The AGI — narrow by design | A philosophy page worth a thread | `/agi` | — |
| Fact Checker | An agent that fact-checks | `/fact-checker` | — |
| Unstoppable Agent | Censorship-resistance story | `/unstoppable` | [tutorials/self-host-agent-backend.md](../../tutorials/self-host-agent-backend.md) |
| Make Dad a 3D Avatar | Evergreen growth page | `/dad` | — |
| Pitch deck (public) | Radical transparency angle | `/pitch` | — |
| i18n | three.ws now speaks your language | site-wide | [docs/i18n.md](../../i18n.md) |
| Light theme | Flip the whole site with one tap | site-wide | — |
| WCAG AA + keyboard-only | The whole platform, accessible | site-wide | — |
| Error pages with support codes | Errors land on a real page, support code ready | changelog 2026-06-23 | — |
| zauth security agent | Lives in the $THREE town | changelog 2026-06-12 | [docs/zauth/index.md](../../zauth/index.md) |

---

## Receipts-and-stats posts (numbers we can prove today)

- **31 MCP servers** in the official registry (tweets have only ever claimed 1–2) — `STRUCTURE.md`
- **19 published zero-dependency SDKs**, 216 green tests — `STRUCTURE.md` SDK table
- **374 public pages** — `npm run build:pages` output over `data/pages.json`
- **635 feature entries** shipped since April 15 — `data/changelog.json`
- **40+ tutorials** — `docs/tutorials/`
- **60 real x402 payments per minute** — changelog 2026-06-27 (`[SOURCE: re-verify live at /agent-economy-volume before posting]`)

---

## Docs debt — write these before announcing

Per CLAUDE.md, a feature isn't done (or announceable — our posts must link proof a stranger can land on) without a doc. Rows marked **—** above. Highest-priority given the posting order:

1. ~~Mission Control / Coin Radar / Live Trade Feed / Watchlist / Coin Intelligence~~ — **done**: [docs/trading-surfaces.md](../../trading-surfaces.md).
2. ~~Arena + Sniper Arena + Theater + Vaults + Swarms~~ — **done**: [docs/trading-arenas.md](../../trading-arenas.md).
3. ~~Claim Your Wallet / Trader Card~~ — **done**: [docs/trader-card.md](../../trader-card.md).
4. **Instant Agent Genesis, Agent Genome, World Lines** — each is a headline feature with no doc at all.
5. ~~Proof-of-Custody / Guardian recovery~~ — **done**: [docs/custody.md](../../custody.md). **Embodied Finance** still needs its doc.
6. **Pump Visualizer, Memetic Launcher, Coin Autopilot** — launch-stack gaps.
7. **Gaussian splats, Scene Capture, Talking Avatar Video, Cinematic FX, Game-Ready export** — creation-pipeline gaps (Game-Ready has only an improvement plan).
8. **Status page, Solana Blinks, Copy-to-AI docs, Credits, Gasless checkout** — small, fast wins.

When one of these docs lands, also add its `data/changelog.json` entry (`docs` tag) and update this file's row.

---

## Suggested posting order

1. **Oracle** — doc exists ([docs/oracle.md](../../oracle.md) + `/oracle/docs`), podcast primed it. Ready now.
2. **Live Agents / Agent Screen** — 25 show specs ready. Pure video.
3. **Sniper + Trading Brain** — doc + package README ready; pairs with Oracle.
4. **IRL / AR** — tutorials + threat model ready; closes the May teaser.
5. **Agora / Labor Market** — docs ready.
6. **The 31-MCP-servers receipt post** — cheap, provable, big number.
7. Rotate sections A–M into the [4-week calendar](calendar-4-week.md); anything hitting a **—** in Docs goes through [Docs debt](#docs-debt--write-these-before-announcing) first.

**Gates before any row ships:** capture the real asset; resolve every `[SOURCE:]`/`[HUMAN:]`; NVIDIA/IBM/Alibaba rows use exact affiliation language per [README.md](README.md) rule 5; Pole Club and Forever need an explicit owner call.
