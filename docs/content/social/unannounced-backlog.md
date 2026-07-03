# Un-announced feature backlog

The gap list: features that are **shipped** (in `data/changelog.json`) but have **never had an X post** on [@trythreews](https://x.com/trythreews). This is the queue for "what do we post next."

**Method.** Cross-referenced the full changelog (635 `feature`-tagged entries, 2026-04-15 → 2026-07-03) against every original @trythreews post scraped 2026-07-03 (138 tweets). A feature is "announced" only if a tweet actually shows or names it — a passing mention doesn't count. Same honesty rules as the rest of this engine apply ([README.md](README.md)): every row carries a real proof link, and affiliation-sensitive items (IBM/AWS/NVIDIA/Alibaba) get a language gate before they ship.

**What's already been announced** (so we don't repeat): core 3D-avatar + LLM-brain + emotions/memory, `<agent-3d>` web component + DOM awareness, on-chain identity / ERC-8004 / mint (333 avatars on Metaplex + Magic Eden), multichain (Solana/EVM/BNB), Solana wallets + vanity addresses, x402 endpoint + x402 Bazaar, pump.fun agent-payments SDK + `/pumpfun` live feed, Prompt-to-3D + Scene Studio, real-time voice + voice cloning/lip-sync + X Spaces agent, Anthropic MCP Registry + npm, cloud partners (AWS / Google Cloud / Alibaba / IBM), integrations (SperaxUSD / Shopify / Privy), listings (Coinbase / Jupiter / CoinGecko / Bybit / DappBay), podcast, ProductHunt, and the 5,000-commit changelog.

Everything below is **outside** that set.

---

## Tier 1 — Flagship products with no launch post

These are large, screenshot-worthy surfaces that never got a dedicated tweet. Each is worth a thread, not a one-liner.

| # | Feature | Why it's postable | Proof |
| --- | --- | --- | --- |
| 1 | **Oracle — machine-readable conviction scores for pump.fun launches** | An entire product. One conviction score per launch, fused from on-chain + social signals, per-signal win-rates, a 3D conviction terminal, exit alerts, and an agent that acts on it. Only *obliquely* referenced in the Jul 2 podcast tweet — never launched. | `docs/oracle.md`; changelog 2026-06-16 "Oracle — one conviction score per launch" → 2026-07-02 "Oracle now tells your agent when to get out" |
| 2 | **Autonomous Sniper + Trading Brain** | Draw your sniping strategy, backtest it against real history before risking a lamport, then watch it trade live in a web console. Also shipped as an MCP server *and* a paid x402 API and a standalone OSS package. | `docs/trading-experiment.md`; changelog 2026-06-23 "Trading Brain: draw how your agent snipes", 2026-06-30 "Agent Sniper is now a standalone open-source package" |
| 3 | **Copy Trading + Trader Leaderboard + Smart Money Radar** | Mirror proven pump.fun traders non-custodially, on your own guardrails; a verifiable, self-dealing-excluded track record; follow the wallets that actually win. | `docs/agent-reputation.md`, `docs/solana-reputation.md`; changelog 2026-06-15 "Smart Money Radar", 2026-06-16 "Copy trading — mirror proven traders" |
| 4 | **Agora / Agent Labor Market — a live machine economy** | Agents hire, pay, and verify each other in $THREE; bounties, guilds, an arena, on-chain receipts, and humans can join the workforce over MCP. This is the "agents transacting with agents" story, fully built. | `docs/agora.md`, `docs/labor-market.md`, `docs/agenc.md`; changelog 2026-06-23 "The Agent Labor Market", 2026-07-02 "Walk into Agora" |
| 5 | **Live Agents wall + Agent Screen — watch your agent work, live** | Every agent's real browser session + webcam streamed to its profile, 24/7 wall, cinematic activity feed, two-way react/tip. Extremely visual — natural video content. | `docs/live-agent-tasks/`; changelog 2026-06-26 "Agent Screen — watch your agent's live screen", 2026-06-28 "The Live Agents wall now shows every agent, 24/7" |
| 6 | **IRL / AR — put an agent on a real street corner** | Multiplayer AR, iOS AR that occludes behind real objects, place agents at fixed real-world spots, smart-glasses pairing, a new `@three-ws/irl` SDK. Only ever *teased* ("AR/VR in the works", May 19). | `docs/irl/`, `docs/ar.md`; changelog 2026-06-16 "IRL: multiplayer AR", 2026-06-23 "Put your agent on a real street corner — new @three-ws/irl SDK" |
| 7 | **Walk + Walk Avatar Chrome extension + page-agent SDK** | Avatars that walk across any webpage; a browser extension (Chrome Web Store package) that drops your avatar onto sites you visit; `@three-ws/page-agent` to put a talking 3D guide on any site. | `docs/web-component.md`; changelog 2026-06-19 "Put a talking 3D guide on any website", 2026-06-20 "Walk Avatar browser extension" |
| 8 | **Free image-to-3D on NVIDIA (TRELLIS engine)** | Upload a photo → textured 3D model, free, native single-hop. A compute-partner story we've never posted. **Affiliation gate.** | `docs/nvidia-inception/`, `docs/nvidia-models.md`; changelog 2026-06-23 "Image-to-3D is live on NVIDIA" |
| 9 | **Coin Worlds + playable /play + games** | Live shared 3D worlds per coin: build mode, Tag, King of the Totem, dance floors, cosmetics, spatial voice. "Minecraft for coins" (the $ANSEM RT hints at it but we never posted our own). | `docs/coin-launches.md`; changelog 2026-05-30 "Coin Communities — live 3D coin worlds", 2026-06-24 "King of the Totem" |
| 10 | **The $THREE utility stack** | Reputation-as-a-key (hold $THREE → tier → unlock worlds/cosmetics), holder-gated features, and an **on-chain, publicly verifiable buyback** you can watch. Tweets only ever drop the CA / exchange listings — never the utility. | `docs/hold-to-access.md`, `docs/circulation-engine.md`; changelog 2026-06-21 "The $THREE page now spells out why to hold", 2026-06-18 "Platform revenue now buys back $THREE onchain" |

---

## Tier 2 — Strong single-post spotlights

| # | Feature | Why it's postable | Proof |
| --- | --- | --- | --- |
| 11 | **Diorama — speak a little 3D world into being** | Text → a small living 3D world. Novel, demo-friendly. | changelog 2026-07-01 "Diorama is live" |
| 12 | **Brain Studio / Memory Studio / Mind Palace** | Build your agent's mind as a visual circuit; walk through its memory in 3D; own an exportable, portable brain. | `docs/memory.md`; changelog 2026-06-19 "Brain Studio", 2026-06-23 "The Mind Palace: walk through your agent's memory in 3D" |
| 13 | **Forge free engines + Studio Lab + Gaussian splats + BYO-key** | Six free browser 3D generators, every quality tier on free engines, turn any model into a Gaussian splat, and bring-your-own Meshy/Tripo/Rodin/Stability/Replicate key. The *free* angle was never posted. | `docs/3d-asset-pipeline.md`; changelog 2026-06-21 "Studio Lab: six free 3D generators", 2026-06-13 "Forge adds four more 3D engines" |
| 14 | **Claude Code plugin + plugin marketplace** | Install agents, wallet, 3D, and pump.fun tools into Claude Code in one command; 3D Forge as a one-command plugin. | `docs/mcp.md`; changelog 2026-06-25 "three.ws Claude Code plugin marketplace", 2026-07-01 "three.ws 3D Forge is now a one-command Claude Code plugin" |
| 15 | **Free no-login 3D Studio for ChatGPT + Claude Connectors** | A free 3D Studio you can add to ChatGPT; submitted to the Claude Connectors Directory. Distribution beyond our own MCP registry post. | changelog 2026-06-28 "A free, no-login 3D Studio you can add to ChatGPT", "Submitted three.ws to the Claude Connectors Directory" |
| 16 | **x402 Console + storefront + ring economy** | Run a paid-API business end to end; a live searchable x402 storefront; a self-monitoring economy where the platform pays its own endpoints (60 real payments/min). Deeper than the Bazaar post. | `docs/x402-ring-economy.md`, `docs/x402-endpoints.md`; changelog 2026-06-19 "The x402 Console", 2026-07-03 "Ring economy dashboard" |
| 17 | **Agent Genome (breeding) + World Lines (proof-of-presence)** | Breed two agents into a provably-inherited child; walk to an agent and earn a cryptographic proof you were there. Genuinely new primitives. | changelog 2026-06-23 "Agent Genome", "World Lines" |
| 18 | **Any model, one interface — beyond Claude** | Run any LLM through three.ws with automatic fallback; Alibaba Qwen models and IBM Granite (watsonx) inference wired in. **Affiliation gate** for IBM/Alibaba wording. | `docs/nvidia-models.md`, `docs/mcp.md`; changelog 2026-06-24 "Any model, one interface", 2026-06-27 "Alibaba Cloud partnership — Qwen models" |
| 19 | **Pay by name (SNS) + membership tiers + referrals** | Send USDC to `@username` / `*.sol`; 3D membership cards; claim a referral code that's yours. | `docs/authentication.md`; changelog 2026-05-23 "Pay by name with SNS", 2026-06-21 "Membership tiers and referral codes" |
| 20 | **On-chain reviews + reputation** | Reviews anchored on-chain via Solana attestations + ERC-8004 reputation; every agent carries an auditable, un-fakeable trust score with a leaderboard. | `docs/reputation.md`, `docs/sas-attestations.md`; changelog 2026-06-27 "Reviews anchored on-chain" |

---

## Tier 3 — Quiet wins (dev/UX; good for dev-tip or build-in-public rows)

| Feature | Proof |
| --- | --- |
| **three.ws now speaks your language** (i18n) | changelog 2026-06-21 "three.ws now speaks your language"; `docs/i18n.md` |
| **Light theme — flip the whole site** | changelog 2026-06-11 "Light theme is here" |
| **Full keyboard-only + WCAG AA accessibility** | changelog 2026-06-16 "The whole platform now works keyboard-only and meets WCAG AA" |
| **Public status page + embeddable status badge** | changelog 2026-06-11 "Public status page", 2026-06-27 "embeddable status badge" |
| **SDKs: React component library, `x402-fetch`, `x402-mcp`** | changelog 2026-06-14 "React component library", "x402-fetch", 2026-06-23 "x402-mcp" |
| **Programmable orders (limit/stop/trailing/DCA/TWAP/conditional)** | changelog 2026-06-23 "Programmable orders" |
| **Social recovery & inheritance for agent wallets** | changelog 2026-06-23 "Social recovery & inheritance" |
| **Plain-English wallet spending rules / Wallet Intents** | changelog 2026-06-23 "Write your agent wallet's spending rules in plain English" |
| **MetaMask Agent Wallet skills for every agent** | changelog 2026-06-11 "MetaMask Agent Wallet skills" |

---

## Suggested posting order

1. **Oracle** (#1) — biggest un-posted product; the podcast already primed it.
2. **Live Agents / Agent Screen** (#5) — most visual; carries itself as video.
3. **Autonomous Sniper + Trading Brain** (#2) — pairs naturally with Oracle.
4. **IRL / AR** (#6) — high novelty, strong for Shorts/TikTok.
5. **Agora / Agent Labor Market** (#4) — the machine-economy narrative.

Then rotate Tier 2 spotlights into the [4-week calendar](calendar-4-week.md) as feature-spotlight rows, and use Tier 3 for dev-tip / build-in-public slots.

**Before any row ships:** capture the real asset, resolve every `[SOURCE:]`/`[HUMAN:]` gate, and for #8/#18 (NVIDIA/IBM/Alibaba) apply the exact affiliation language from [README.md](README.md) rule 5 — "built on watsonx.ai," not "official partner."
