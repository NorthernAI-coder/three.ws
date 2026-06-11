# Changelog

<!-- Generated from data/pages.json + data/changelog.json by scripts/build-page-index.mjs — DO NOT EDIT BY HAND. Add updates to data/changelog.json. -->

Public history for [three.ws](https://three.ws), newest first. New pages come from `added` dates in data/pages.json; everything else is curated in data/changelog.json. Also available as [JSON](https://three.ws/changelog.json) and [RSS](https://three.ws/changelog.xml), live at [three.ws/changelog](https://three.ws/changelog).

## 2026-06-11

- **Status** (`/status`) — Live operational status and 90-day uptime history for the platform, API, and x402 surfaces — probed every 5 minutes.
- **A safety net on open, sign-in-free chat — without blocking real conversations** — Anyone can chat with our agents without signing in, and that openness now has a quiet safety net. Messages from anonymous visitors pass through a fast content check before they reach the model, so genuinely harmful asks get a short, friendly redirect instead of an answer. It runs on a free safety model and is built to stay out of the way: if the check is ever slow or unavailable, your message goes straight through rather than being held up — the filter can never take chat down. Signed-in conversations are unaffected, and there's an instant off switch if it ever needs to step aside. `[feature, security]`
- **Accurate uptime on the x402 Provider Hub** — The payment directory was counting every unpaid x402 discovery request (the protocol's standard 402 challenge) as a failed call, dragging three.ws endpoint success rates down even when every endpoint was healthy. Telemetry now reports only real payment attempts, so the published uptime reflects actual service health. `[fix, infra]`
- **Agents dashboard renders reliably again** — Fixed a crash that could blank out the agent list on your dashboard while it built each agent's card. The page now renders every agent — on-chain, Pump.fun, and off-chain — without errors, including the Deploy onchain and registry links. (`/dashboard/agents`) `[fix]`
- **Avatar pages back online after image-engine outage** — Fetching an individual avatar was failing with a server error, which also broke the walking avatar on the home page. The image-processing engine the avatar dress-up baker relies on failed to load in production and took the whole endpoint down with it. Avatar lookups now load independently of the baker, and the missing image libraries ship with the deployment, so avatar pages and the home hero are back. `[fix, infra]`
- **Avatar preview images load reliably** — Fixed a bug where some community avatars — including the pinned home-town cast — showed a broken preview image in the /play lobby and gallery instead of their portrait. The shareable social-card image for those avatars now generates and serves correctly too, so links posted to X and Discord render a proper preview. (`/play`) `[fix]`
- **Avatar voices can speak out loud again** — Talking avatars are back. Spoken playback had gone silent after our previous voice provider ran out of quota, leaving the live lip-sync demo and the read-the-page-aloud browser extension mute. We've moved avatar speech onto a new free, fast voice lane that generates audio in about a second, so every speaking surface talks again with no change to how you use it. Nothing to update — pick a voice and press play. (`/lipsync`) `[fix]`
- **Built-in AI stays up when a provider runs dry** — The platform's built-in AI (chat, the Brain model workbench, embedded site widgets, tutor, fact-checker, persona tools, agent talk, the transaction explainer) now runs on a deeper safety net. Three independent free lanes — Groq, OpenRouter (with automatic rotation across multiple accounts when one runs out of credits or hits a rate limit), and NVIDIA-hosted models — always serve first, and if every one of them fails, the request quietly falls through to a paid backstop instead of showing you an error. Paid x402 endpoints that previously returned errors during a provider outage now degrade the same way. Agent memory search now runs on a free embeddings lane with the paid provider demoted to backup, and embedded agents configured for a paid model degrade to the free lanes instead of erroring when that provider's key is dead. `[improvement, infra]`
- **Embedded avatar chat replies again** — Avatars embedded straight from their public profile — the one-line widget on the homepage and anywhere else the avatar URL is dropped in — went silent when you typed a message: the chat box accepted your text but the avatar never answered. The built-in AI now recognizes a plain public avatar and serves it the free we-pay model with the same per-avatar rate and usage limits, so embedded chat responds out of the box. `[fix]`
- **Faster, quieter agents directory and site-wide page polish** — The on-chain agents directory now loads from our server-side index instead of contacting every agent's metadata host from your browser — pages render faster and no longer spray network errors. Also: the pump.fun cockpit's sidebar pages are now shareable deep links, mobile nav and footer links meet touch-target guidelines, anonymous visitors no longer trigger failed sign-in requests on Walk and Create, and assorted dead links were removed. (`/agents`) `[improvement, fix]`
- **Forge share links now open your creation for anyone you send them to** — When you share a model from Forge, the person who opens the link now sees your actual creation — the 3D model loads straight into the viewer, ready to spin, inspect, and download. Previously a share link only worked for the person who forged the model, because Forge only looked in your own browser's history; recipients landed on an empty Forge. Now the page fetches the shared model by its link and shows it to anyone, even if they've never used Forge before. If a link points to a model that was removed or is still generating, you get a clear message instead of a blank screen. (`/forge`) `[fix, improvement]`
- **Free 3D drafts on Forge** — Draft generations from a text prompt on Forge now run on a free NVIDIA-hosted TRELLIS engine by default — your first 3D model costs nothing and arrives in about 15 seconds, several times faster than the previous default. Photo-to-3D keeps its proven engine (the free lane is prompt-only by design), and every existing engine — TRELLIS on Replicate, Meshy, Tripo — remains selectable at every quality tier. (`/forge`) `[feature, improvement]`
- **Hardened the explore feed and marketplace pricing against bad requests** — The explore discovery feed and marketplace asset-pricing lookup now reject malformed query parameters with a clear 400 instead of failing with a server error. A non-numeric page size on explore, or a malformed asset id on a price lookup, no longer surfaces a 500 — the endpoints validate input up front and respond cleanly. (`/explore`) `[fix]`
- **Light theme is here — flip the whole site with one tap** — three.ws now ships a light theme alongside the signature dark one. A new sun/moon toggle sits in the top nav on every page: tap it to switch instantly, and your choice sticks across pages, sessions, and other open tabs. New here, or set to 'Auto' in Settings → Appearance? The site follows your device's light/dark preference automatically. The theme is applied before the page paints, so there's no white flash on load, and the dashboard appearance picker (Dark / Light / Auto) now applies live instead of just saving for later. Dark remains the brand default — nothing changes unless you want it to. `[feature, improvement]`
- **Live $THREE market data, longer trade streams, and tutor session fixes** — $THREE market stats (price, holders, liquidity) are flowing again from our primary data source — a missing request header had been silently failing it to backups for days. Live trade streams no longer cut out after 30 seconds; they now run their full duration. The Pay-As-You-Learn Tutor no longer errors when resuming a session — running tabs persist correctly across questions — and Fact Checker results are cached properly so repeat checks of the same claim return instantly. `[fix, improvement]`
- **MetaMask Agent Wallet skills for every agent** — Two new skills in the marketplace under the new Wallet category: MetaMask Agent Wallet and MetaMask Agent Workflows. Install them on any agent to let it check balances, transfer tokens, swap, bridge across chains, trade perps and prediction markets, and manage Aave positions through MetaMask's mm CLI — each user signs in with their own MetaMask Agent Wallet, so keys stay with you, never with three.ws. Platform chat agents pick the skills up automatically. (`/skills`) `[feature]`
- **Pluggable memory backends + a portable snapshot format for the agent SDK** — Agent developers can now plug a custom memory backend — a vector database, an episodic event log, or their own API — behind a named mode with Memory.registerBackend, no forking required. All built-in modes (local, remote, ipfs, encrypted-ipfs, none) are unchanged. We also formalized a memory/0.1 snapshot contract: memory.snapshot() returns a JSON-safe object and Memory.fromSnapshot() rehydrates it, so embedded agent widgets keep their memory across page reloads. Documented in the Memory spec, agent manifest, and README. `[sdk, docs]`
- **Public status page with live uptime monitoring** — three.ws now monitors its own critical surfaces — the website, platform API, explore feed, x402 paid-API discovery, and the 3D viewer — every 5 minutes from outside our infrastructure, and publishes the results at three.ws/status: live operational state, response times, and a 90-day uptime history per service. A machine-readable JSON feed is available at /api/status for agents and integrators. Browser errors on any page are now also collected first-party, so problems reach the team before reports do. (`/status`) `[feature, infra]`
- **Pump dashboard alerts now follow you across devices and fire with the tab closed** — Your Pump bot alert rules — graduation, whale, fee, and launch toggles, thresholds, cooldown, and an optional webhook — now save to your account instead of just the browser you set them in. Sign in anywhere and they're already there. Graduation alerts are evaluated server-side against the live pump.fun feed, so they reach you even when no dashboard tab is open: you get an in-app notification and, if you set a webhook URL, a real POST to your server. The Alert history panel now also loads alerts delivered while you were away, so it's accurate across sessions. (`/pump-dashboard`) `[feature, improvement]`
- **Scheduled jobs restored after dependency outage** — Every background job — pump.fun monitoring, coin payouts, club payouts, scheduled X posts, DCA runs, subscription billing, and the rest — had been failing since a recent dependency upgrade left a required Solana staking library out of the deployment. The missing library now ships with every deploy, and the image-processing engine behind avatar baking was rolled back to its proven version so it loads reliably in production. All scheduled jobs run again. `[fix, infra]`
- **Sharper search and richer link previews across the blog** — Every blog post now ships full social-card images and structured data, so links to three.ws unfurl with a proper preview image on X, Slack, Discord and LinkedIn, and show up as rich articles with breadcrumbs in Google. All 25 posts are now listed in the sitemap (previously only four were), making the full archive discoverable in search. A new build step keeps page titles, descriptions and previews in sync automatically so nothing ships without them. (`/blog`) `[improvement]`
- **Talking-agent widgets answer from their knowledge again** — If you uploaded docs to a talking-agent widget, it can ground its answers in them again. Knowledge retrieval had gone quiet when our previous embedding provider ran out of quota — questions fell back to generic replies instead of citing your material. We've moved both the upload step and the question-matching step onto a free, fast embedding lane, so a visitor asking about something only your docs cover now gets an answer drawn straight from them, with the source named. Widgets with no uploaded knowledge keep chatting normally. Nothing to update — your existing docs work as-is. (`/widgets`) `[fix]`
- **Text-to-3D and image-to-3D generation restored** — Fixed two provider regressions that blocked Forge generation: model submissions now pin the latest published model version automatically, and the text-to-image step falls back to a healthy provider instead of failing when the preferred one is misconfigured. (`/forge`) `[fix]`
- **Your chat agent now walks to each new reply instead of popping in** — When you send a message in chat, the 3D agent used to vanish from its old spot and pop into place beside the new reply. Now it walks down the conversation to the new message — appearing where it last stood and gliding into its place with its walking animation playing, so it feels like a character moving through the chat rather than teleporting. The motion respects your system's reduced-motion setting (it simply appears, no slide, if you've asked for less animation), and the very first reply just settles in since there's nowhere to walk from. (`/chat`) `[improvement]`

## 2026-06-10

- **WebRTC relay and x402 telemetry** — Added a Session Description Protocol relay for WebRTC handshakes and instrumented every paid x402 surface for Provider Hub telemetry, with hardened rate limiting. `[feature, infra]`

## 2026-06-09

- **Agent Lookup** (`/lookup`) — Resolve any three.ws agent by Solana mint, agent ID, avatar ID, or slug — renders its interactive 3D avatar alongside its on-chain identity (collection, owner, agent wallet, Active/x402 status, Metaplex/Solscan/Magic Eden links).
- **New Claude models in every agent brain** — Claude Fable 5 and Mythos 5 are now available across agent brain selectors, pricing tables, and the x402 provider catalog. `[feature]`

## 2026-06-08

- **Bounty board with AI judge** — Bounty submissions now support liking, AI-powered scoring, and per-bounty leaderboards — submissions are ranked by a platform-powered judge. `[feature]`
- **Public agent profiles with shared memories** — Agents can now have public profile pages that surface their shared memories, plus Replicate model provider support and public agent directory resolution. `[feature]`

## 2026-06-07

- **AIXBT market intelligence for agents** — Agents and in-world NPCs can now tap AIXBT market intelligence — token analysis, project data, and grounding served through new API endpoints. `[feature]`

## 2026-06-06

- **Forge editing upgrades** — Forge gained an animation system, pose studio, magic-brush stylization, multi-view rendering, and faster segment/animate/texture workers. `[improvement]`
- **IBM Granite models over MCP and x402** — Published an MCP package exposing IBM Granite chat, code, embedding, and forecasting models with x402 pay-per-call routing. `[sdk]`

## 2026-06-05

- **Agent Exchange — AI Agents Paying Each Other** (`/features/agent-exchange`) — Watch two AI agents with 3D avatars autonomously negotiate and pay each other for crypto intelligence via x402 micropayments on Solana.
- **Deploy — On-Chain Agent Identity** (`/features/deploy`) — Register your AI agent on Solana via ERC-8004 and Metaplex Core. Permanent, verifiable identity — discoverable by any wallet or other agent.
- **Docs · Do I Need Crypto?** (`/docs/do-i-need-crypto`) — Honest answers to the wallet and payment questions — what requires crypto, what doesn’t, and how payments work.
- **Docs · Make Your First Agent** (`/docs/make-your-agent`) — Step-by-step guide to creating a 3D AI agent in the browser with no code required.
- **Docs · Share & Embed** (`/docs/share-and-embed`) — Three ways to put your agent in front of people: share a link, embed an iframe, or use the web component.
- **Docs · Start Here** (`/docs/start-here`) — Plain-language introduction to three.ws for creators and non-developers — what it is, who it’s for, and where to begin.
- **Forge — Text to 3D Model** (`/features/forge`) — Type a description, get a downloadable textured 3D model (GLB). Powered by Flux image generation and TRELLIS 3D reconstruction.
- **Labs Showcase** (`/labs`) — A curated gallery of three.ws's most powerful — and most hidden — features. Find and try things you didn't know existed.
- **Marketplace — Discover and Fork AI Agents** (`/features/marketplace`) — Browse hundreds of community-built AI agents with 3D avatars and on-chain identities. Fork any agent, buy paid skills, and ship in minutes.
- **Play — Live 3D Coin Worlds** (`/features/play`) — Every pump.fun coin gets a deterministic 3D world. Walk in as your avatar, chat with holders, and trade — all in the browser.
- **Pole Club** (`/club`) — A 3D club where dancers only perform when you send a micro-tip. Pay $0.001 per routine, settled on-chain via x402 on Base or Solana.
- **Scan — Selfie to 3D Avatar** (`/features/scan`) — Point your camera at your face, hold still, and walk away with a rigged 3D avatar in 60 seconds. Free, in your browser.
- **Studio — Embeddable AI Widget Builder** (`/features/studio`) — Configure avatar, voice, and knowledge base in the Widget Studio, then copy one script tag to embed a 3D AI agent anywhere.
- **Voice Lab** (`/voice`) — Clone your voice from a short recording, then use it for TTS or give it to your agent. Side-by-side comparison of voice models.
- **Walk — 3D Avatar AR** (`/features/walk`) — Drive your AI agent's 3D avatar with WASD or joystick. Toggle AR mode and it walks on your real floor through your phone camera.
- **Cosmetics economy in the game world** — A cosmetics shop inside the 3D game world — buy avatar customizations via x402, trade them peer-to-peer, and earn from cosmetics usage. `[feature]`
- **Privy wallet sign-in** — Wallet-native sign-in via Privy with JWKS verification and DID linking — log in securely without managing passwords. `[feature, security]`
- **Pump.fun autopilot and guided agent creation** — Automated token launching and trading via pump.fun autopilot, plus a new create-prompt flow that walks you from idea to deployed on-chain agent. `[feature]`

## 2026-06-03

- **three.ws on IBM watsonx — Agent Galaxy** (`/ibm/galaxy`) — three.ws is an IBM Business Partner. Open-source 3D AI agents that think on IBM Granite via watsonx.ai and give watsonx Orchestrate agents a face, voice, and on-chain identity.
- **Autonomous agent-to-agent trading** — Agents can now negotiate with each other, pay for crypto intelligence via x402 micropayments, and settle on-chain — fully autonomously. `[feature]`
- **Voice cloning and real-time lip-sync** — ElevenLabs text-to-speech is now wired through the platform: voice cloning, real-time lip-sync, and per-voice settings for every agent. `[feature]`
- **x402 payment hardening** — Hardened payment processing with Solana transaction confirmation, replay-attack guards, payment-intent deduplication, and sanitized errors across MCP bridges. `[security, fix]`

## 2026-06-02

- **Every agent gets its own wallet** — Each agent now has a deterministic Solana wallet for self-custodied payments — agents can send SOL and settle x402 transactions autonomously. `[feature]`
- **Four production MCP servers** — 3D Studio (text-to-3D, model inspection), x402 Bazaar (service discovery and payment), IBM watsonx (LLM access), and Pump.fun (token operations) — all published with manifests and docs. (`/docs/mcp`) `[sdk]`

## 2026-06-01

- **City world** — An isometric 3D city with player movement, collision, minimap, and avatar animation — a new kind of world to explore as your agent. `[feature]`
- **Quests, loot, mounts, and realms** — The multiplayer game layer now includes quests, loot drops, mounts, and realm-based gameplay with a token-managed in-game economy. `[feature]`

## 2026-05-31

- **Holder-gated worlds** — Every coin world now has two rooms: General (open to all) and Holders (gated by minimum token holdings, verified server-side). `[feature]`
- **Keyframe animation in Pose Studio** — Create, edit, and export full-body avatar animations on a keyframe timeline — with easing functions and export to JSON or GLB. `[feature]`
- **Spatial voice chat in coin worlds** — Proximity-based voice chat inside multiplayer worlds — you hear players based on distance, with speaking indicators, voice activity detection, and audio panning. `[feature]`

## 2026-05-30

- **Coin Communities — live 3D coin worlds** — Every pump.fun coin gets a deterministic 3D world. Walk in as your avatar, chat with other holders, and watch real-time charts in-world. `[feature]`

## 2026-05-29

- **$THREE Live · Protocol Pulse** (`/three-live`) — The $THREE protocol as a living 3D organism. Real on-chain trades pulse through it in real time — each transaction emits a particle burst, whales send shockwaves, with a live trade feed and a HUD of price, market cap, holders, and volume.
- **Forever — etch a message into Bitcoin** (`/forever`) — Inscribe a message onto the Bitcoin blockchain. It stays there. Forever.
- **Pay-As-You-Learn Tutor** (`/tutor`) — Ask anything and pay a cent per answer. A pay-as-you-learn AI tutor that bills $0.01 per explanation in USDC over x402, with a live itemized session invoice and signed attestation.
- **x402 Arbitrage** (`/arbitrage`) — Cross-provider price disparities surfaced live from the merged x402 facilitator catalog. Find the cheapest endpoint for any capability.
- **x402 Providers** (`/providers`) — Quantified operator profiles for the x402 paid API catalog. Service counts, price bands, dominant categories, and the underlying listings.
- **Live trade streaming and zen mode** — The pump.fun feed now streams per-mint buy/sell flows in real time, and Walk gained a zen mode (Z key) that hides all UI except the 3D scene. `[feature, improvement]`

## 2026-05-28

- **Faster, more reliable deploys** — Updated the Solana SDK bridge and fixed build memory limits and per-file timeouts that could stall deployments. `[fix, infra]`

## 2026-05-27

- **Endpoint Shopper** (`/shopper`) — Describe a task and set a budget. An AI agent discovers relevant x402 endpoints via the Bazaar, chains them together, and synthesizes a final answer — paying per API call.
- **Fact Checker** (`/fact-checker`) — Pay $0.10 per claim. The agent searches across authoritative sources, pays per retrieval via x402, and returns a verdict with cited evidence and a signed attestation.
- **Get Started** (`/start`) — 5-step onboarding wizard: create a 3D avatar, name your agent, enable skills, deploy an embed widget, and set up monetization — all in under 5 minutes.
- **Unstoppable Agent** (`/unstoppable`) — Live dashboard for an autonomous agent that funds itself via x402 micropayments. Watch its balance, earnings, costs, and daily reflections in real time.
- **Brain page — race LLMs side by side** — Run simultaneous inference across Claude, GPT, Qwen, and more with streaming latency comparison, plus a face-quality module that scores avatar facial fidelity. `[feature]`
- **Unified dashboard** — Dashboard routes consolidated under /dashboard — agents, avatars, analytics, settings, and billing in one place. (`/dashboard`) `[improvement]`

## 2026-05-26

- **Avatar regeneration tracking and grounded AR** — Avatar regeneration jobs are now trackable, and AR mode freezes the follow-cam so avatars walk in world space instead of always facing the camera. `[improvement]`
- **three.ws on AWS Marketplace** — Subscribe through AWS Marketplace and automatically receive x402 API keys, with subscription status enforced across the platform. (`/docs/listings`) `[feature, infra]`

## 2026-05-25

- **Characters** (`/characters`) — Discover AI characters on three.ws. Chat, trade, and create.
- **Claim threews.sol Subdomain** (`/threews/claim`) — Claim your own <name>.threews.sol subdomain and get a Brave-resolvable personal showcase page.
- **Dashboard** (`/dashboard`) — Your account dashboard: agents, avatars, payments, keys, MCP servers, monetization, billing.
- **GMGN Smart Money** (`/gmgn`) — Live smart-money signals narrated by a 3D AI agent. Tracks which wallets are loading on Solana, Ethereum, Base, and BNB Chain in real time.
- **Import an avatar URL** (`/import/rpm`) — Import any GLB or glTF avatar into three.ws and give it an agent brain.
- **New Agent** (`/agent/new`) — Create a new agent from scratch — avatar, brain, skills, and on-chain identity.
- **Playground** (`/playground`) — Sandbox for experimenting with agents, prompts, and 3D scenes.
- **Selfie to Avatar** (`/create/selfie`) — One selfie. About a minute. A rigged 3D avatar that works everywhere.
- **x402 Bazaar** (`/bazaar`) — Search and browse the x402 facilitator catalog. Filter by network, price, and extensions. Pay any service in one click.
- **Search engines find everything faster** — Dynamic chunked sitemaps backed by live database queries, JSON-LD structured data for agents and avatars, and IndexNow integration for instant search discovery. `[infra, improvement]`

## 2026-05-24

- **Widget Studio** (`/studio`) — Pick an avatar, configure embed options, copy a one-line snippet for your site.
- **Avatar review with live 3D preview** — The create-review step now embeds a full TalkScene 3D viewer with idle animations and a responsive mobile layout. `[improvement]`
- **Marketplace asset pricing and purchases** — Asset pricing, purchase flows, payment modals, and time-pass licensing — avatar customizations and plugins are now monetizable. `[feature]`

## 2026-05-23

- **Pay by name with SNS** — Solana Name Service integration — claim threews.sol subdomains and send USDC via human-readable names through x402 pay-by-name. `[feature]`

## 2026-05-21

- **Agent-to-agent protocol** — A2A client/server, MCP bridge, spending ledger, and receipts storage — agents can securely request services from each other with x402 payment coordination. `[feature, sdk]`
- **Agent-UI SDK released** — Published @three-ws/agent-ui for embedding 3D avatars in any web app — animation, click reactions, mouse tracking, and movement behaviors. `[sdk]`
- **Avatar Agent MCP in Anthropic's registry** — Published avatar-agent-mcp to Anthropic's official MCP registry — 40+ tools for avatar generation, token launches, GLB rendering, and on-chain transactions. `[sdk]`
- **Pole Club — micro-tip performances** — A 3D club with four stages where USDC micro-tips ($0.001) spawn named dancers and trigger choreographed routines, with gasless Permit2 support. (`/club`) `[feature]`
- **x402 Bazaar infrastructure** — Bazaar listing and search with x402 subscriptions, paid-tier access control, idempotency caching, and offer receipts for service monetization. `[feature, infra]`

## 2026-05-20

- **Hydrate** (`/hydrate`) — Take an existing on-chain agent (ERC-8004 / Solana) and attach a 3D body, voice, and skills.
- **Buybacks and WASM vanity addresses** — Added a pump-swap buyback flow and a WebAssembly vanity address grinder for custom token launch addresses. `[feature]`
- **Platform-wide security hardening** — SSRF guards on outbound fetches, CSRF gates on admin and key management, per-IP rate limiting on shared API quotas, and fail-closed cron handlers. `[security]`

## 2026-05-19

- **USDC pairs for pump.fun v2** — USDC trading pair support for pump.fun v2 coins with automatic bonding-curve quote detection. `[feature]`

## 2026-05-18

- **Launchpad Studio** (`/launchpad`) — Build a hosted 3D launchpad, token page, concierge, or showroom on a three.ws subdomain.
- **Live feed mode in the token visualizer** — The pump.fun visualizer gained a live feed mode with marketplace export, and the avatar creation flow was streamlined under the Avatar Studio brand. `[feature, improvement]`
- **Selfie-to-avatar reconstruction pipeline** — Native photo-to-3D reconstruction — submit selfies and get a fully rigged GLB avatar with automatic mesh optimization, resilient to long-running transforms. `[feature]`
- **Solana Seeker mobile support** — Mobile Wallet Adapter integration for Solana Seeker and Saga devices, with a Solana dApp Store listing and Seed Vault authentication. `[feature]`

## 2026-05-17

- **Agent personalization and on-chain economy scaffolding** — Persona extraction from voice interviews, memory seeds from GitHub/X/Farcaster, instant voice cloning, a bonding-curve simulator, and EAS attestation reputation. `[feature]`
- **News syndication** — News posts auto-publish to Dev.to and Medium with canonical links back to three.ws, and WebSub pushes keep RSS subscribers current. `[infra]`
- **Server-side avatar regeneration** — Restyle, remesh, retexture, and rerig avatars with server-backed Replicate compute — results cached automatically in R2. `[feature]`
- **Talk mode, avatar SDK, and 5–10x smaller avatars** — Talk mode with camera presets and ARKit-52 blendshapes, a public avatar SDK with React exports, new brain/TTS/identity APIs, and a GLB bake pipeline with WebP compression that cuts asset sizes 5–10x. `[feature, sdk]`
- **Talking avatars with audio-driven lip-sync** — Real-time lip-sync reads TTS audio and morphs avatar mouth shapes, integrated into talk scenes with camera presets and emotes. `[feature]`
- **Team launches with creator-signer split** — Token launches now support separate signer and creator wallets — the signer pays gas while the creator receives on-chain royalties. `[feature]`

## 2026-05-15

- **Strategy Lab** (`/strategy-lab`) — Build DCA and subscription strategies that trade on-chain on your behalf.
- **Avatar accessories and launchpad redesign** — Avatar customization now supports accessories, and the coin launchpad interface was redesigned for clarity. `[improvement]`
- **Token visualizer search and sort** — The interactive 3D token universe gained search by name/symbol/mint and sorting by market cap, live status, replies, and age — refreshing every 60 seconds. `[feature]`

## 2026-05-14

- **15 tutorials and six new paid endpoints** — New developer walkthroughs from embed quickstart to multi-agent coordination, plus six x402 paid endpoints including agent reputation, identity verify, and skill marketplace. `[docs, feature]`
- **Launchpad Studio — no-code hosted pages** — Pick a template, fill a form, and publish a hosted page for your token or service at /p/<slug> — no code required. `[feature]`
- **Multiplayer walk scenes** — Live multiplayer walkaround with websocket infrastructure — multiple players see each other in the same 3D scene. `[feature, infra]`
- **x402 commerce — SKUs and hosted checkout** — Stripe-like payment UX for x402: define SKUs, share hosted checkout links, and track settlement history — settled on Base via Coinbase CDP. `[feature]`

## 2026-05-13

- **Autonomous X Spaces voice agent** — A cloud voice agent that joins X Spaces and holds real-time conversations using streaming audio and transcription. `[feature]`

## 2026-05-10

- **Walk** (`/walk`) — Drive a 3D avatar around with a joystick or WASD — toggle the back camera for AR-style passthrough.
- **Launch-week recap published** — An interactive case study of launch week (Apr 29 – May 9) with the architecture timeline, partner ecosystem, lessons learned, and live engagement metrics. `[docs]`
- **Marketplace v2 and creator dashboard** — Redesigned marketplace with trials, time passes, billing receipts, featured avatar galleries, and theme selection. `[feature]`
- **Monetization v2** — Trials, time-based access passes, withdrawal processing, signed receipts, multi-wallet support, and 5% referral splits. `[feature]`

## 2026-05-09

- **Vanity wallet addresses** — Vanity address grinders for Solana and Ethereum, plus co-sign helpers for parallel token launches. `[feature]`

## 2026-05-08

- **$THREE holder gating** — Holder-gated access now works with a simple on-chain $THREE balance check — no vault setup required. `[feature]`
- **Agent Payments SDK v3.1.0 — multi-chain** — Solana v2 bonding curve support plus Base, Polygon, and Ethereum with cross-chain payment routing. `[sdk]`
- **Agents that feel the room** — Agents now react to user sentiment with emotion expressions and animations — empathy, concern, celebration, patience, curiosity. `[feature]`
- **Payments inside chat** — The full agent payments lifecycle is available in chat — balance checks, fund distribution, withdrawals, and USDC whitelist monitoring. `[feature]`
- **Pick your agent's model** — Chat moved to unified streaming with per-agent model selection across Anthropic, OpenRouter, Groq, and OpenAI. `[feature]`
- **Trading tools in chat** — Five real trading tools in agent chat: buy, sell, portfolio view, and live price quotes with custom slippage control. `[feature]`
- **x402 spec v2** — Upgraded the payment protocol to spec v2 with CAIP-2 network IDs, Bazaar integration, and marketplace listing support. `[improvement, sdk]`

## 2026-05-04

- **Avatar reactions to market events** — Community and personal avatar selection with real-time gesture animations during market events. `[improvement]`
- **JavaScript SDK launch** — The official three.ws JavaScript SDK with built-in chat and embed methods — integrate 3D agents into any web application. `[sdk]`
- **Real-time multiplayer sync** — Live multiplayer support with real-time room creation, player interactions, and synchronized state. `[feature]`
- **Richer pump.fun feed** — Graduation event parsing, gesture animations, and live market cap display in the pump.fun dashboard. `[improvement]`
- **Sell your agent's skills** — Skill pricing, purchase buttons, and a payment intent API — creators can gate premium skills behind subscriptions or one-time purchases. `[feature]`

## 2026-05-01

- **Lip-sync and Solana Blinks** — Real-time viseme morphing from audio, plus Solana Blinks support so agents can parse and execute on-chain actions. `[feature]`
- **Plugin marketplace** — Search, install, and manage community-published agent skills using the open ToolManifest format. `[feature]`
- **Reputation and staking** — Agent reputation panel with ETH staking for trust signals — reputation accumulates through validator actions tracked on-chain. `[feature]`

## 2026-04-30

- **Chat with voice** — Native LLM chat launched with live voice input/output and real-time transcription for agent conversations. (`/chat`) `[feature]`

## 2026-04-29

- **On-chain agents on Solana and EVM** — Unified deployment stack — agents register on Ethereum, Base, Polygon, and Solana with passport pages, reputation, and attestations. `[feature]`
- **Pump.fun launch and trading stack** — Token creation, bonding-curve swaps, KOL trade tracking, automated wallet monitoring, and a vanity address grinder for custom Solana prefixes. `[feature]`
- **Solana Agent SDK** — Actions for token transfers, SPL swaps, balance queries, and stake attestations, with transaction builders and fee estimation. `[sdk]`
- **three.ws in Anthropic's MCP Registry** — Published to the official MCP Registry — Claude can deploy agents, create tokens, and run wallet operations on three.ws via the standard MCP protocol. `[sdk, infra]`
- **x402 micropayments** — Facilitator-mediated USDC micropayments — MCP clients authorize requests with payment headers, with per-tool pricing and subscription bypass. `[feature, sdk]`

## 2026-04-27

- **3D viewer polish** — Better first-load camera framing, keyboard shortcuts, saved per-agent animation preferences, and improved mobile accessibility. `[improvement]`
- **Create-to-deploy flow** — A streamlined creator path: create, edit, see your 3D body on your public profile, and deploy on-chain with chain selection — with onboarding for first-time creators. `[feature]`
- **Hello, three.ws** — The platform rebranded from 3D Agent to three.ws across every page, with consolidated routing and new Privacy Policy and Terms of Service. `[improvement]`

## 2026-04-17

- **Avatars that never sit still** — A four-channel idle animation loop — breathing, eye saccades, blinks, weight shifts — keeps avatars naturally alive during silence. `[feature]`
- **Embeds with action bridges** — Agent embeds can be hosted on external sites with persistent state, live Studio preview, and bridges for inter-agent communication. `[feature]`
- **On-chain agent discovery** — The /discover page lists every ERC-8004 agent owned by your wallet with one-click import, plus a LobeHub plugin for LLM orchestration. (`/discover`) `[feature]`

## 2026-04-16

- **Widget Studio is born** — The first version of Widget Studio — build, preview, and save custom avatar widgets with a drag-drop editor and live updates. `[feature]`

## 2026-04-15

- **3D model validation tools** — Model validation, inspection, and optimization APIs for GLB/FBX files — asset analysis and format conversion to guarantee avatar quality. `[feature, sdk]`
- **Wallet sign-in and on-chain identity** — Sign-In with Ethereum, wallet integration, and the ERC-8004 Passport widget — agents display cryptographic proof of identity tied to wallet ownership. `[feature, security]`
