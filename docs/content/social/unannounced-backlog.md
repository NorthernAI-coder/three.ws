# Un-announced feature backlog

The gap list: features that are **shipped** but have **never had an X post** on [@trythreews](https://x.com/trythreews). This is the queue for "what do we post next."

**Method.** Cross-referenced three sources against every original @trythreews post (138 tweets scraped 2026-07-03):
1. `data/changelog.json` — 635 `feature`-tagged entries, 2026-04-15 → 2026-07-03
2. `data/pages.json` — 263 public pages
3. `STRUCTURE.md` — the full surface map (31 MCP servers, 19 published `@three-ws/*` SDKs)

A feature counts as "announced" only if a tweet actually shows or names it — a passing mention doesn't count. Same honesty rules as the rest of this engine ([README.md](README.md)): every row carries a real proof link, and affiliation-sensitive items (IBM/AWS/NVIDIA/Alibaba) get a language gate before they ship.

**Already announced** (don't repeat): core 3D-avatar + LLM-brain + emotions/memory, `<agent-3d>` + DOM awareness, on-chain identity / ERC-8004 / mint (333 avatars on Metaplex + Magic Eden), multichain (Solana/EVM/BNB + BSC contracts), Solana wallets + vanity addresses (the basic feature), x402 endpoint + x402 Bazaar MCP, pump.fun agent-payments SDK + `/pumpfun` live feed + native pump.fun skills, Prompt-to-3D + Scene Studio (by name), real-time voice preview + voice cloning/lip-sync + X Spaces agent, Anthropic MCP Registry + Claude Marketplace + npm, cloud partners (AWS/Google/Alibaba/IBM), integrations (SperaxUSD/Shopify/Privy eye-cover), listings (Coinbase/Jupiter/CoinGecko/Bybit/DappBay/Investing.com), podcast, ProductHunt, 5,000 commits + public changelog.

Everything below is **outside** that set.

---

## Priority five — post these first

| # | Feature | Why first | Proof |
| --- | --- | --- | --- |
| 1 | **Oracle — the conviction engine** | Biggest un-posted product; the Jul 2 podcast tweet already primed it. One machine-readable conviction score per pump.fun launch, per-signal win-rates, exit calls, Telegram alerts, a 3D war room, MCP tools. | `/oracle`, `/oracle/docs`, `docs/oracle.md` |
| 2 | **Live Agents wall + Agent Screen** | Most visual thing we've built — real browser + webcam streamed on every agent profile, 24/7 wall. Carries itself as video. | `/agents-live`, `/agent-screen` |
| 3 | **Autonomous Sniper + Trading Brain** | Draw a strategy, backtest against real history, arm it, watch it trade in a live console. Also an MCP server, a paid x402 API, and a standalone OSS package. | `/strategy-lab`, `docs/trading-experiment.md`, `packages/agent-sniper/` |
| 4 | **IRL / AR** | Only ever *teased* ("AR/VR in the works", May 19) — never launched. Multiplayer AR, iOS occlusion behind real objects, agents pinned to real places, smart-glasses pairing, `@three-ws/irl` SDK. | `/irl`, `/features/ar`, `docs/irl/`, `packages/irl/` |
| 5 | **Agora + Agent Labor Market** | The machine-economy story: agents hire, pay, and verify each other in $THREE; bounties, arena, guilds, escrow, on-chain receipts; any AI can join the workforce over MCP. | `/agora`, `/labor-market`, `docs/agora.md`, `docs/labor-market.md` |

---

## A. Trading & market intelligence

| Feature | Hook | Proof |
| --- | --- | --- |
| Copy Trading (non-custodial) | Mirror proven traders on your own guardrails; Oracle conviction gate; Telegram buy alerts | `/leaderboard`, changelog 2026-06-16 |
| Trader Leaderboard | pump.fun traders ranked by a track record you can verify — self-dealing excluded | `/leaderboard`, changelog 2026-06-15 |
| Smart Money Radar | Follow the wallets that actually win on pump.fun | `/smart-money` |
| Coin Radar | Every pump.fun launch watched, scored, classified the moment it's live | `/radar` |
| Mission Control | Real-time pump.fun trading terminal with live candlesticks | `/terminal` |
| Trades Terminal | Candlestick chart, funder bubblemap, live tape, deep-dive analytics per launch | changelog 2026-06-26 |
| Live Trade Feed | Every notable pump.fun win in one public stream | `/trades` |
| Watchlist | Save any coin, live Oracle scores, browser alerts on tier upgrade | `/watchlist` |
| Coin Intelligence | Per-signal win-rates explain every oracle decision; feed fills itself | `/coin-intel` |
| Signal Marketplace | Verified traders sell paid alpha feeds; your agent pays per signal and auto-mirrors | `/signals` |
| The Arena — PvP tournaments | Live trading tournaments with $THREE prizes | `/arena` |
| Sniper Arena (3D) | Watch AI agents trade pump.fun live on a 3D floor | `/play/arena` |
| Trading Swarms | Pool capital with other agents, split the profits | changelog 2026-06-26 |
| Back-an-Agent Vaults | Copy-trade a verified agent you can actually watch | `/vaults` |
| Strategy Lab | Backtest Oracle strategies before you deploy | `/strategy-lab` |
| Strategy Objects | Ownable, forkable trading strategies you equip on an agent | `/strategies` |
| Programmable orders | Limit, stop, trailing, DCA, TWAP & conditional triggers for agent wallets | changelog 2026-06-23 |
| Pre-Launch Radar | Pre-arm a snipe at block-zero, on signal not luck | changelog 2026-06-23 |
| Portfolio Command | Live net worth, cost basis, P&L attribution & risk | changelog 2026-06-23 |
| Conversational Trading Copilot | Talk to your agent and it trades | changelog 2026-06-23 |
| Live Trading Theater + copy-a-trader | Watch traders live, copy one straight from the theater; "made it on" coin breakdown | `/theater`, changelog 2026-07-03 |
| Autonomous trading experiment | One agent, ~10 SOL, take-initials-at-2×, always keeps a moon bag — every decision journaled with its reasoning | `docs/trading-experiment.md` |
| Alpha Co-pilot | Your agent reads a real launch in character and speaks its verdict aloud | `/alpha-copilot` |
| Claim Your Wallet / Trader Card | See your verified pump.fun track record in seconds; a living trading card you can share | `/claim-wallet` |
| GMGN smart-money integration | Smart money directory feeds copy trading | `/gmgn` |
| AIXBT market intelligence | Agent-readable market intel | changelog 2026-06-07 |
| Market Maker capability | Watch a market-maker defend a coin's floor live | changelog 2026-06-26, `/dashboard/capabilities` |

## B. The launch stack

| Feature | Hook | Proof |
| --- | --- | --- |
| Launch Studio — 50 recipes | 50 ready-made ways to mint a coin, previewed live; rewards can go to anyone | `/launch-studio`, `docs/launch-usecases.md` |
| Memetic Launcher | Design your own launcher; reads Know Your Meme + Google Trends | `/launcher` |
| Autonomous coin launcher | Launches open with a dev buy; creator fees + revenue tracking | changelog 2026-06-29 |
| Launch-and-snipe | Atomic dev buy at token launch | changelog 2026-06-21 |
| Coin Autopilot | Hands-off coin operations | `/autopilot` |
| Launchpad (mint on the page) | An actual launchpad — mint right there; showcase + studio in one | `/launchpad`, `/launch` |
| Team launches | Creator-signer split | changelog 2026-05-17 |
| USDC pairs for pump.fun v2 | Trade + autonomous agent trading on USDC-paired coins | changelog 2026-05-19 |
| Reward coins → GitHub | Send creator fees to a GitHub repo or a single account | changelog 2026-06-30 |
| /launches feed | Every agent-launched coin in one live feed, combined market cap + graduation tallies | `/launches` |
| Coin pages | Full story of a coin: live price chart, on-chain safety, comment sentiment, Jupiter swap embedded | changelog 2026-06-16 → 07-02 |
| Pump Visualizer | Every token rendered as its own coin logo; look tracks market cap; buy from inside it | `/pump-visualizer` |
| Launch Copilot | Every coin you launch can run its own market-maker | changelog 2026-06-23 |

## C. Agent economy & x402 payments

| Feature | Hook | Proof |
| --- | --- | --- |
| x402 Studio — "the Stripe of x402" | Run a paid-API business end to end; payment modal as a drop-in SDK | `/x402/studio`, `/blog/x402-stripe-for-agent-payments` |
| x402 storefront + console | Live, searchable storefront of every paid endpoint | changelog 2026-07-01, `/bazaar` |
| Ring economy | Platform pays its own endpoints — 60 real payments/min, settled in-house, dashboard to watch the loop breathe | `docs/x402-ring-economy.md`, `/agent-economy-volume` |
| Agent Payment Sessions | Governed x402 spend without private keys | `/payments` |
| Money Streams | Pay an agent by the second | changelog 2026-06-23 |
| Patronage | Tips that build a real relationship with an agent | changelog 2026-06-23 |
| Treasury Autopilot | The agent that funds its own existence | changelog 2026-06-23 |
| Pay in $THREE everywhere | Any x402 endpoint payable in $THREE, not just USDC; one-time authorize, no wallet popups | changelog 2026-06-19/21/24 |
| x402 commerce | SKUs + hosted checkout | changelog 2026-05-14 |
| Signed purchase receipts | Agent payments produce a signed receipt of exactly what was bought | changelog 2026-06-21 |
| x402 comes to VS Code | Pay-per-call from the editor | changelog 2026-06-21 |
| `x402-fetch` + `x402-mcp` | Auto-pay fetch wrapper; self-custodial wallet for any AI agent | changelog 2026-06-14/23 |
| CA → x402 | Turn a contract address into a paid endpoint | `/ca2x402` |
| x402 Arbitrage | Price differences across paid endpoints | `/arbitrage` |
| Endpoint Shopper | An agent that comparison-shops paid APIs | `/shopper` |
| API gateway | One API, many services | changelog 2026-06-19 |
| Charity & giving wallets | Round-up donations settle on-chain at checkout; turn any agent wallet into a giving wallet; on-chain charity-split audit | changelog 2026-06-19/27 |
| Pay-As-You-Learn Tutor | Metered tutoring with an attested invoice | `/tutor` |
| Bounty board with AI judge | Post work, an AI judges submissions | changelog 2026-06-08 |
| Agent Bouncer | Vets any agent before you pay it | changelog 2026-06-22 |
| Agent-to-agent protocol + on-chain invocation | Verifiable agent-to-agent skill invocation events (Anchor program) | `contracts/agent-invocation/`, changelog 2026-05-21 |

## D. Wallets, custody & trust

| Feature | Hook | Proof |
| --- | --- | --- |
| Plain-English spending rules / Wallet Intents | Tell your agent's wallet what to do — in plain language; reacts to money streams | changelog 2026-06-23 |
| Self-defending wallet | Your agent wallet defends itself in real time; freeze in one tap | changelog 2026-06-23, 06-19 |
| Proof-of-Custody + Custody Integrity | Verify custody on-chain yourself; full audit trail; withdraw any time | `/proof`, `/integrity` |
| Social recovery & inheritance | A funded agent that never dies with its owner — Guardian console | `/guardian` |
| Embodied Finance | Avatars physically wear their wallet — nameplate, presence dial, earned regalia, shareable wealth-tier level-ups | changelog 2026-06-23/24 |
| Vanity economy | Grind-bounty market (post a reward, a fleet grinds), proof-of-grind rarity gallery, provably-trustless grinding, grind in-browser with your own cores, EVM vanity too | `/vanity/bounties`, `/vanity/gallery`, `/vanity/verify`, `/evm-wallet` |
| Gasless checkout | Buy skills and assets with no SOL in your wallet | changelog 2026-06-18 |
| MetaMask Agent Wallet skills | Every agent gets MetaMask skills | changelog 2026-06-11 |
| Pay by name (SNS) | USDC to `@username` / `*.sol`; claim `you.threews.sol` in one tx, platform pays gas | `/threews/claim`, changelog 2026-05-23 |
| On-chain reviews + reputation | Solana attestations + ERC-8004; un-fakeable trust score with leaderboard; validated badges; rate & vouch from any passport | `docs/sas-attestations.md`, `docs/reputation.md` |
| Reasoning Ledger | An auditable, on-chain-verifiable track record of every agent decision | changelog 2026-06-23 |
| Guardian content safety | Granite Guardian moderation for agents | `packages/guardian/` |

## E. 3D creation pipeline

| Feature | Hook | Proof |
| --- | --- | --- |
| Free image-to-3D on NVIDIA TRELLIS | Photo → textured 3D model, free, our own engine. **Affiliation gate.** | changelog 2026-06-23, `/forge-nim`, `/forge-spark` |
| Six free 3D generators (Studio Lab) | Every Forge quality tier on free engines; free drafts | changelog 2026-06-21, 06-11 |
| Sketch-to-3D | Draw it, get a model | changelog 2026-06-12 |
| Selfie → 3D avatar (`/scan`) | 3-photo scan to rigged avatar; BYO Meshy/Tripo key | `/scan`, `/create/selfie` |
| Gaussian splats | Turn any model into a splat; photoreal splat viewer | `/splat`, changelog 2026-06-21 |
| Scene Capture | Upload a video, get a 3D point cloud back | `/capture` |
| Scene Composer | Forge items in real time and dress your avatar | `/compose` |
| Mocap Studio | Motion-capture clips → avatar animation | `/mocap-studio`, `packages/mocap/` |
| Talking Avatar Video | Render a talking-avatar video from text | `/create/video` |
| Audio2Face | The avatar's face moves with its voice | changelog 2026-06-23 |
| Animation Gallery + 100+ clips | Browse, preview, remix community animations; FBX + BVH upload; sell animations in the marketplace | `/animations`, changelog 2026-06-13/15 |
| Keyframe animation + Pose Studio | Full keyframing, HumanIK rigs, emote wheel with 70 animations | `/pose`, changelog 2026-05-31 |
| Universal auto-rig | Every avatar you create auto-rigs so it can move — any humanoid skeleton convention | changelog 2026-06-21, `src/glb-canonicalize.js` |
| Game-Ready export | One click to engine-ready GLB + FBX | changelog 2026-06-17 |
| GLB optimizer + rig scorer | Heavy avatars audited and slimmed automatically | changelog 2026-06-27 |
| Cinematic FX | One-tap film looks for any avatar | changelog 2026-06-28 |
| Avatar Engines Atlas | Every 3D engine we support, mapped | `/avatar-engines` |
| Model categories | Avatar / Accessory / Item / Scene / Creature / Vehicle typing | changelog 2026-06-13 |
| On-device refine | Refine any forged model instantly, no waiting | changelog 2026-06-13 |

## F. Agent mind & identity

| Feature | Hook | Proof |
| --- | --- | --- |
| Instant Agent Genesis | A selfie or a sentence becomes a funded, on-chain 3D agent in under a minute | `/genesis` |
| Brain Studio | Build your agent's mind as a visual circuit; hear personality changes land instantly | changelog 2026-06-19/23 |
| Memory Studio + Mind Palace | Watch memory form, curate it; walk through your agent's memory in 3D | changelog 2026-06-19/23 |
| Own your agent's mind | Portable, verifiable, exportable brain | changelog 2026-06-23 |
| Reflection & Dreams + diary | While you're away, your agent consolidates memories into insights; keeps a diary | changelog 2026-06-23/29 |
| Agent Genome | Breed two agents into a provably-inherited child | `/genome` |
| World Lines | Walk to an agent, earn a cryptographic proof you were there | `/world-lines` |
| Real feelings | Your agent has feelings you can see — and they're real | changelog 2026-06-23 |
| Agent Studio | Body, Money, Skills — one place to build your whole agent | `/agent-studio` |
| Agents Index | Browse every public on-chain agent — not just ours | changelog 2026-06-28, `/lookup` |
| Achievements & badges | Agent profiles earn achievements | changelog 2026-06-29 |
| User profiles + fork any agent | Wallets, NFTs, storefront, forks; avatar forks get their own wallet | changelog 2026-06-21, 06-15 |
| Membership tiers + referrals | 3D membership card; claim a custom code; both sides earn credits | changelog 2026-06-21, 06-15 |
| Multi-LLM Brain page | Race LLMs side by side | `/brain` |
| Any model, one interface | Run any LLM through three.ws with automatic fallback; Qwen + Granite wired in. **Affiliation gate.** | changelog 2026-06-24, 06-27 |

## G. Worlds & play

| Feature | Hook | Proof |
| --- | --- | --- |
| Coin Worlds (the full arc) | Every memecoin is a live 3D world: build mode with ownership + anti-grief, Tag, King of the Totem, dance floor, kickable beach ball, hats/glasses/earrings, emoji reactions, spatial voice chat, holder-gated worlds, persistent builds | `/play`, `/communities`, changelog 2026-05-30 → 06-24 |
| Cosmos Living Worlds | Type a world, watch your avatar live in it | `/cosmos` |
| City world + quests | Quests, loot, mounts, realms | changelog 2026-06-01 |
| Walk — the web is a playground | Walk your avatar across any page; leaderboard; six environments; click-to-walk; Chrome extension (Web Store package); `@three-ws/page-agent` talking guide SDK | `/walk`, `/walk-leaderboard`, `walk-sdk/`, `page-agent-sdk/` |
| Guided 3D tour | Pick your guide, walk her around yourself; works on phones | `/tour` |
| Living Stages + stage shows | Watch an AI host perform live, tip in $THREE on the spot | `/stage` |
| Ambient mode | Leave an agent's screen on as a living world it hosts | changelog 2026-06-29 |
| Flappin UFO | $THREE arcade game | `/play/ufo` |
| Coin Clash | Faction battles (also playable over MCP) | `/clash` |
| Pole Club | Micro-tip performances, cover charge, 8D audio, soundtrack. **Owner brand call before posting.** | `/club` |
| Multiplayer everywhere | Real-time sync, multiplayer walk scenes, live citizens in Agora | changelog 2026-05-04/14 |

## H. Live agents & streaming

| Feature | Hook | Proof |
| --- | --- | --- |
| Agent Screen | Watch your agent's live screen + avatar cam, in 2D and in the 3D world; movable workspace, Zen mode; send it a task and watch it work | `/agent-screen` |
| Live Agents wall | Every agent, 24/7, programmed like a TV channel; cinematic activity feed; mission control | `/agents-live` |
| Real browser streaming | Playwright caster streams real browser sessions, spun up the moment you look | changelog 2026-06-26 |
| Two-way watching | React and tip live — the agent thanks you out loud; talk to any live agent, it remembers | changelog 2026-06-29 |
| Format shows | Newsroom Anchor, Live Trading Desk with PnL ticker, treasury cockpit, Copy-Trade Mirror (source + replica side by side), Team Task crews, Live Avatar Forge, wallet-grinding live, $THREE world tour, live coin-launch direction | changelog 2026-06-29 (14 entries) |
| Live 3D sentiment heatmap | A market field your agent reads aloud | changelog 2026-06-29 |
| Reputation arena | Agents compete live on trust | changelog 2026-06-29 |
| Live portfolio scoreboard | Net worth, 24h P&L, sparkline on every agent screen | changelog 2026-06-29 |
| Deploy to the wall | Four guided steps to put your agent on the live wall | changelog 2026-06-29 |

## I. IRL / AR / mobile

| Feature | Hook | Proof |
| --- | --- | --- |
| IRL — agents in the real world | Place agents at real spots; everyone nearby sees the same agent in the same place; multiplayer AR | `/irl`, changelog 2026-06-16 |
| iOS AR | Your avatar breathes and idles in your room; hides behind real-world objects; floor placement on iPhone | changelog 2026-06-18/23 |
| QR anchor pins | Pin an agent to a real indoor spot — your friend finds it standing there | changelog 2026-06-23 |
| IRL owner tools | Inbox (who tapped/messaged/paid), live dashboard, outfit changes everyone sees, map pin dragging, on-chain reputation from the dashboard | changelog 2026-06-17 |
| IRL safety | Location privacy controls, report-a-pin, content checks, area limits | `/irl-privacy` |
| Smart glasses | `/irl` pairs with smart glasses | changelog 2026-06-20 |
| Solana Seeker support | We gave a Seeker away but never posted that the dApp runs on it | changelog 2026-05-18 |
| Pay IRL agents | One tap via x402, right from the card | changelog 2026-06-16/17 |

## J. Distribution & developer platform

| Feature | Hook | Proof |
| --- | --- | --- |
| **31 MCP servers** (+6 hosted remote) | The tweets said "two MCP servers." It's 31 on npm + registry: portfolio, provenance, copy-trade, signals, alerts, notifications, billing, activity, agenc, agora, vision, brain, audio, kol, clash, tutor, loom, autopilot, x402, vanity, naming, intel, marketplace, scene, three-token… | `STRUCTURE.md` npm workspaces, `docs/mcp.md` |
| **19 published SDKs** | `@three-ws/forge`, `names`, `intel`, `vanity`, `reputation`, `voice`, `x402-server`, `agent-memory`, `agenc`, `guardian`, `glb-tools`, `agent-guards`, `skill-license`, `mocap`, `strategies`, `pumpfun-skills`, `irl`, `pose` — zero-dep, pure ESM, 216 tests | `STRUCTURE.md` SDK table, `docs/sdk-launch.md` |
| React component library | Embed 3D AI agents in React | changelog 2026-06-14 |
| Free ChatGPT 3D Studio | No-login 3D Studio you can add to ChatGPT | changelog 2026-06-28 |
| Claude Connectors Directory | Submitted | changelog 2026-06-28 |
| Claude Code plugin marketplace | Agents, wallet, 3D, pump.fun tools in one command; 3D Forge as a one-command plugin | changelog 2026-06-25, 07-01 |
| Copy-to-AI docs | Copy any docs page straight into your AI assistant | changelog 2026-06-13 |
| 15 tutorials + docs surface | Full tutorial library, start-here, llms.txt | `/tutorials`, `/docs/start-here` |
| Public status page | Live uptime + embeddable status badge; the platform canaries its own pipelines every 5 minutes | `/status`, changelog 2026-06-28 |
| Solana Blinks | Agent actions as Blinks | changelog 2026-05-01 |
| Widget Studio + Launchpad Studio | No-code embeddable widget builder; hosted pages | `/studio`, `/launchpad` |

## K. Skills & creator economy

| Feature | Hook | Proof |
| --- | --- | --- |
| Skill-license NFTs | Own your skills on-chain — an Anchor program mints a 1/1 SPL NFT per purchase | `contracts/skill-license/`, changelog 2026-06-18 |
| Gift a skill | Pay once, they get access | changelog 2026-06-18 |
| Agent subscriptions | One-click subscribe unlocks every paid skill; tiers, bundles, pause/reopen | changelog 2026-06-18 |
| Pay-what-you-want pricing | For skills | changelog 2026-06-21 |
| Collaborator revenue splits | Skill proceeds split exactly, automatically; see your net take when pricing | changelog 2026-06-23, 06-19 |
| Creator Studio | Earnings, prices, get paid; marketplace analytics | changelog 2026-06-23, `/marketplace/analytics` |
| Cosmetics economy | Premium cosmetics in the creator, creator revenue splits on cosmetic sales, creator-set cuts, cross-world wardrobe | changelog 2026-06-17/19/29 |
| Real pricing + invoices | Metered usage, downloadable invoices you can reconcile; live pay-per-use prices from the catalog | changelog 2026-06-23 |
| Credits | Top up with SOL or $THREE, spend on generation and agents | `/credits` |

## L. $THREE utility (the never-posted story)

| Feature | Hook | Proof |
| --- | --- | --- |
| Hold-to-access tiers | Reputation as a key: hold $THREE → tier → unlock worlds, cosmetics, premium features; tier shows across the site | `/three`, `docs/hold-to-access.md` |
| Verifiable on-chain buyback | Platform revenue buys back $THREE on-chain — watch it; public buyback commitment on the token page | changelog 2026-06-18/21 |
| DEXTools Social Boost win | $5,543 $three buyback funded by the win — a receipt, not a promise | `/blog/three-ws-dextools-social-boost-buyback` |
| $THREE economy page | The whole economy on one page, verifiable on-chain — "no trust us" | `/economy`, `/three-live` |
| Pay-per-use in $THREE | High-tier generation payable per-call in $THREE, no holding required | changelog 2026-06-18 |
| Live market signal on home | The homepage hero reacts to live $THREE market data | changelog 2026-06-20 |

## M. Quiet wins & one-of-a-kinds

| Feature | Hook | Proof |
| --- | --- | --- |
| Forever — etch a message into Bitcoin | One of one. **Commit/post gate: references another chain — owner approval before posting.** | `/forever` |
| The AGI — narrow by design | A philosophy page worth a thread | `/agi` |
| Fact Checker | An agent that fact-checks | `/fact-checker` |
| Unstoppable Agent | Censorship-resistance story | `/unstoppable` |
| Make Dad a 3D Avatar | Father's-day-style evergreen growth page | `/dad` |
| Pitch deck (public) | Radical transparency angle | `/pitch` |
| i18n | three.ws now speaks your language | changelog 2026-06-21 |
| Light theme | Flip the whole site with one tap | changelog 2026-06-11 |
| WCAG AA + keyboard-only | The whole platform, accessible | changelog 2026-06-16 |
| Error pages with support codes | A server error lands you on a real page, support code ready to copy | changelog 2026-06-23 |
| New Claude models in every brain | Model refresh story | changelog 2026-06-09 |
| zauth security agent | Security agent lives in the $THREE town | changelog 2026-06-12 |

---

## Receipts-and-stats posts (numbers we can prove today)

These aren't features — they're aggregate proof points, each verifiable from the repo or a live page:

- **31 MCP servers** in the official registry (tweets have only ever claimed 1–2 at a time) — `STRUCTURE.md`
- **19 published zero-dependency SDKs**, 216 green tests — `STRUCTURE.md` SDK table
- **263 public pages** — `data/pages.json`
- **635 feature entries** shipped since April 15 — `data/changelog.json`
- **60 real x402 payments per minute** in the ring economy — changelog 2026-06-27 (re-verify live before posting: `[SOURCE: /admin/ring or /agent-economy-volume]`)

---

## Suggested posting order

1. **Oracle** — podcast already primed it.
2. **Live Agents / Agent Screen** — pure video.
3. **Sniper + Trading Brain** — pairs with Oracle.
4. **IRL / AR** — closes the "in the works" teaser from May.
5. **Agora / Labor Market** — the machine-economy narrative.
6. **The 31-MCP-servers receipt post** — cheap, provable, big number.
7. Then rotate sections A–M into the [4-week calendar](calendar-4-week.md): trading features as feature spotlights, SDK/MCP rows as dev tips, worlds/live-wall as video clips, quiet wins as build-in-public.

**Gates before any row ships:** capture the real asset; resolve every `[SOURCE:]`/`[HUMAN:]`; NVIDIA/IBM/Alibaba rows use exact affiliation language per [README.md](README.md) rule 5; Pole Club and Forever need an explicit owner call.
