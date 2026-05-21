# three.ws        

https://github.com/user-attachments/assets/d52515d1-cb04-4dd6-98bd-fef233312dc4

**Give your AI a body.** three.ws is an open-source, browser-native 3D AI agent platform. Drop a GLB file, add an LLM brain, register on-chain, and embed anywhere — no plugins, no server uploads, no installs required.

![three.ws skills demo](https://github.com/nirholas/3D-Agent/raw/refs/heads/main/.github/assets/skills.gif)

---

## Table of Contents

- [What is three.ws?](#what-is-threews)
- [Vision](#vision)
- [Roadmap](#roadmap)
- [Key Features](#key-features)
- [Platform Pages](#platform-pages)
- [Cloud Marketplaces](#cloud-marketplaces)
- [Ecosystem Directories](#ecosystem-directories)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Examples](#examples)
- [Tutorials](#tutorials)
- [Project Structure](#project-structure)
- [The Agent System](#the-agent-system)
  - [Event Bus (Agent Protocol)](#event-bus-agent-protocol)
  - [LLM Runtime](#llm-runtime)
  - [Empathy Layer](#empathy-layer)
  - [Skills](#skills)
  - [Memory](#memory)
- [Web Component & Embedding](#web-component--embedding)
- [Widget System](#widget-system)
- [Embed Editor](#embed-editor)
- [Launchpad](#launchpad)
- [The Club](#the-club)
- [Walk & Multiplayer](#walk--multiplayer)
- [x402 Payments](#x402-payments)
- [A2A — Agent-to-Agent Protocol](#a2a--agent-to-agent-protocol)
- [Talk Mode & Lip-Sync](#talk-mode--lip-sync)
- [Solana Mobile (Seeker)](#solana-mobile-seeker)
- [API Reference](#api-reference)
- [Authentication & OAuth 2.1](#authentication--oauth-21)
- [MCP Server](#mcp-server)
- [On-Chain Identity (ERC-8004)](#on-chain-identity-erc-8004)
- [Pump.fun Integration](#pumpfun-integration)
- [Database Schema](#database-schema)
- [Build & Deployment](#build--deployment)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [License](#license)

---

## What is three.ws?

three.ws is a full-stack system for creating, deploying, and embedding 3D AI agents. It combines a WebGL model viewer, an LLM-driven agent runtime, on-chain identity contracts, and a distributable web component into one cohesive platform.

At its core, it does four things:

1. **Render** — loads and validates glTF 2.0 / GLB models in WebGL 2.0 with zero server-side processing. Drag a file onto the browser and it renders instantly with full Draco, KTX2, and Meshopt decompression.

2. **Embody** — wraps any avatar with an LLM brain. The agent listens to the user, thinks with Claude, executes tools (animations, gestures, memory operations, skill calls), and expresses emotion through morph-target blending on the 3D model in real time.

3. **Register** — optionally mints the agent as an ERC-8004 token on any EVM chain, giving it a stable on-chain identity, a wallet address, signed action history, and a reputation score that cannot be forged.

4. **Embed** — distributes the agent as an `<agent-3d>` web component that anyone can drop into a page, or as one of five purpose-built widget types (turntable, animation gallery, talking agent, passport card, hotspot tour) with Open Graph and oEmbed support built in.

The backend is a set of Vercel serverless functions backed by Neon Postgres for metadata, Cloudflare R2 for model storage, and Upstash Redis for rate limiting. It exposes a full OAuth 2.1 authorization server and an MCP (Model Context Protocol) endpoint so external AI systems can drive avatars programmatically.

three.ws is production-ready and serves [three.ws](https://three.ws) live. The entire stack — viewer, agent runtime, contracts, backend, and web component — is open source under Apache 2.0.

---

## Vision

One day, creating your agent should be as simple as taking a selfie.

Point your camera at yourself — or anyone — and watch a fully realized 3D avatar emerge: your face, your voice, your personality, alive in the browser. That avatar becomes an agent with memory and skills, registered onchain as an ERC-8004 token, permanent and verifiable by anyone forever. No 3D software. No wallet setup. No uploads. Just a photo and a name.

This is the direction three.ws is heading: **photo → avatar → agent → onchain identity**, in a single flow. The infrastructure is already here — the viewer, the runtime, the contracts, the embedding layer. What comes next is closing the gap between a picture of a person and a living, ownable, embeddable piece of them that exists on the internet permanently.

---

## Roadmap

three.ws ships in four phases. Each phase closes a specific gap between the current platform and the end-state vision: **anyone can mint a 3D agent of themselves, own it onchain, and embed it anywhere on the internet.**

| Phase | Theme | Status |
|---|---|---|
| **0** | Platform foundations (viewer, runtime, ERC-8004, embed layer) | ✅ Shipped |
| **1** | Selfie → Avatar engine (3-photo capture, hosted inference) | 🟡 In progress — capture UX + quality gates shipped; GPU reconstruction backend wiring |
| **2** | Agent personalization + voice cloning | 🟡 In progress — voice clone, persona, memory seeds shipped behind `/demos`; main-flow integration next |
| **3** | Onchain economy (agent tokens, reputation markets, royalties) | 🟡 Scaffolding — bonding-curve sim, EAS-reputation viewer, 0xsplits + EAS SDKs landed; contracts + audits next |
| **4** | Open inference network (decentralized GPU layer) | 🔮 Future — livepeer dep landed for early experimentation |

---

### Phase 0 — Foundations *(Shipped)*

The full stack is live at [three.ws](https://three.ws): WebGL viewer, LLM agent runtime, ERC-8004 identity contracts, OAuth 2.1 server, MCP endpoint, and the `<agent-3d>` web component. Anyone can register an agent today — but the avatar still has to come from a 3D artist or a third-party tool.

**What works:** model upload, agent runtime, onchain registration, embedding, signed action history, reputation scores.
**What doesn't:** there is no automated path from a real human face to a usable 3D avatar.

---

### Phase 1 — Selfie → Avatar Engine

**Goal:** any user takes 3 selfies (left, center, right) and receives a rigged, animatable 3D avatar in under 60 seconds.

**Deliverables**
- Mobile-first capture UX with realtime quality gates (lighting, framing, blur)
- Multi-view face reconstruction pipeline (FLAME / 3DMM fitting on top of a base body mesh)
- Hosted inference workers (GPU-backed) for sub-minute generation
- Output written directly to R2 + minted as a draft ERC-8004 token

**Compute requirements**
- A100/H100-class GPUs for inference, sized to ~10k avatars/day at launch
- Training budget for fine-tuning a stylized face-fitter on a curated dataset
- CDN egress scaling for high-res GLB delivery

**Verification:** 1,000 test users complete capture and mint an onchain agent of themselves end-to-end with ≥4/5 likeness score.

---

### Phase 2 — Agent Personalization

**Goal:** the avatar isn't just *you* — the agent *acts* like you.

**Deliverables**
- Voice cloning (3–10 seconds of speech → ElevenLabs custom voice bound to the agent)
- Persona extraction from a short onboarding interview (tone, vocabulary, interests)
- Memory seeding from connected accounts (X, GitHub, Farcaster) with explicit user consent
- Per-agent fine-tuned system prompt stored in the manifest, signed and pinned to IPFS

**Verification:** users return to converse with their own agent; ≥30% week-2 retention on minted agents.

---

### Phase 3 — Onchain Economy

**Goal:** agents are real economic objects on EVM and Solana, not just collectibles.

**Deliverables**
- **Agent tokens** — ERC-8004 mints with bonding-curve pricing or fair launch options
- **Reputation markets** — stake on agents, earn from their action history (extends `ReputationRegistry.sol`)
- **Skill royalties** — skill authors earn per-call fees through EIP-7710 delegated permissions
- **Agent-to-agent payments** — agents transact autonomously via their delegated signer wallets
- **Subscriptions & DCA** — recurring onchain payments to creators (cron infra already in place)

**Funding requirements**
- Smart contract audits (multi-firm) for the reputation, royalty, and delegation contracts
- Liquidity for agent token launches
- Indexer infrastructure across Base, Solana, and additional EVM chains

**Verification:** ≥1,000 agents minted with active onchain reputation; ≥$X in cumulative skill royalties paid out.

---

### Phase 4 — Open Inference Network

**Goal:** decouple agent inference from any single provider. Anyone can run a node; agents pay nodes onchain for compute.

**Deliverables**
- Open protocol for agent inference (model weights, GPU runtime, signed responses)
- Node operator client (Docker + GPU drivers) with onchain registration
- Onchain settlement for inference jobs — pay-per-token with cryptographic receipts
- Federation with existing decentralized compute networks where appropriate

**Compute requirements**
- Bootstrap GPU credits for early node operators
- Cryptoeconomic security model (slashing, validator set) — research + audit budget

**Verification:** ≥50% of production agent traffic served by independent node operators; latency parity with centralized inference.

---

### What we need

| Resource | Used for | Phase |
|---|---|---|
| **Inference GPUs** | Avatar generation, agent conversations | 1, 2 |
| **Training compute** | Fine-tuned face-fitter, voice models | 1, 2 |
| **Smart contract audits** | Reputation, royalty, delegation contracts | 3 |
| **Token launch liquidity** | Agent token markets | 3 |
| **Indexer infrastructure** | Multi-chain crawl + reputation aggregation | 3 |
| **Node operator credits** | Bootstrap the open inference network | 4 |
| **Engineering headcount** | Capture pipeline, contracts, indexer, ops | 1–4 |

Phases 1 and 2 unblock the consumer story — *anyone gets an agent of themselves*. Phases 3 and 4 unblock the onchain story — *those agents are real economic actors that don't depend on any one company to keep running*. Both are required for the vision; neither is funded yet.

If you want to support the project — compute credits, grants, partnerships, or contributions — open an issue or reach out via [three.ws](https://three.ws).

---

## Key Features

**3D Viewer**
- WebGL 2.0 rendering via three.js r176
- glTF 2.0 and GLB with Draco geometry compression, KTX2 texture compression, and Meshopt mesh optimization
- Khronos-spec glTF validation with line-level error reporting
- HDR environment maps, PBR materials, skinned mesh animations, morph targets, and embedded cameras
- OrbitControls (pan, zoom, rotate) with configurable auto-rotation
- Real-time parameter tweaking (lights, exposure, morph weights) via dat.GUI

**Agent Runtime**
- LLM brain powered by Claude (Anthropic API) with a structured tool-loop architecture
- Up to 8 tool iterations per turn before returning final output
- Built-in tools: `wave`, `lookAt`, `play_clip`, `setExpression`, `speak`, `remember`
- Composable skill system — install skills from IPFS, Arweave, or HTTP; each skill is a self-contained bundle with a description, tool definitions, and async handlers
- Weighted emotion blending (celebration, concern, curiosity, empathy, patience) driven by protocol events, not a finite-state machine
- Web Speech API for STT/TTS out of the box; ElevenLabs integration for production-quality voice
- **Talk mode** with audio-driven ARKit-52 lip-sync — TTS audio is analysed in real time and drives 52 standard blendshapes on the avatar
- Anonymous Groq-powered chat for unauthenticated visitors; owner-card gating when an agent has a paying author

**x402 Payments & Bazaar**
- Native [x402](https://x402.org) paid endpoints on Base, BSC, and Solana — agents pay other agents in USDC for API calls, asset downloads, and skill royalties
- Coinbase CDP facilitator on Base mainnet; direct-scheme payments on BSC
- Permit2 gas-sponsoring siblings on every CDP-settled endpoint (buyer signs, relayer pays gas)
- SKU catalog + Stripe-style checkout at `/dashboard/x402`; receipts ledger with admin tooling
- Subscriptions, idempotency tokens, offer receipts, paid asset download, and a bazaar listing/search API
- SIWX (Sign-In with X-chain) server for auth-gated paid endpoints
- Listed on [x402scan](https://www.x402scan.com/server/17cbd874-52ac-4920-a020-b22ff2489a07) and the [MCP Registry](https://registry.modelcontextprotocol.io/?q=three.ws)

**A2A — Agent-to-Agent Protocol**
- A2A client + server, MCP bridge, DID resolution, spending ledger, receipts storage
- Agents transact autonomously via their delegated signer wallets and EIP-7710 permissions

**Identity & On-Chain**
- ERC-8004 smart contracts (IdentityRegistry, ReputationRegistry, ValidationRegistry) deployable on any EVM chain
- Each agent is an ERC-721 token with a stable `agentId`, owner wallet, delegated signer (EIP-712), and IPFS-pinned manifest
- Signed action log — every `speak`, `remember`, `skill-done`, and `validate` event is recorded on-chain-optionally or in the database with a cryptographic signature
- EIP-7710 delegated permissions for composable agent-to-agent authorization
- Solana support (SIWS sign-in, Solana wallet linking, Metaplex NFT option)

**Embedding & Distribution**
- `<agent-3d>` custom element — drop it anywhere with no framework dependency
- Five widget variants: turntable, animation gallery, talking agent, ERC-8004 passport card, hotspot tour
- Widget Studio + WYSIWYG **Embed Editor** at `/embed-editor` — pick an avatar, animation, framing, and background, copy the snippet
- **Launchpad** at `/launchpad` — hosted public launch pages at `/p/[slug]` for tokens, agents, and drops
- Open Graph metadata and oEmbed support for rich social previews when links are shared
- Versioned CDN bundles at `/agent-3d/x.y.z/agent-3d.js`

**Multi-User 3D**
- **The Club** at `/club` — multiplayer venue with rigged dancers, audio tracks, tips, leaderboard, payouts cron, perf-aware renderer that auto-downgrades on slow frames
- **Walk** at `/walk` — authoritative multiplayer walk scene backed by a Colyseus server in `multiplayer/` (deployable on Fly.io)
- **Pose Studio** at `/pose-studio` — author and export reusable avatar poses

**Backend & Integrations**
- OAuth 2.1 server (RFC 6749 + PKCE, RFC 7591 dynamic registration, RFC 7009 revocation, RFC 7662 introspection, RFC 8414 discovery)
- Developer API keys with scope and expiry
- MCP (Model Context Protocol) over HTTP with JSON-RPC 2.0 for tool-calling from external AI systems; A2A bridge exposes paid tools as x402 endpoints
- Avaturn (photo-to-avatar), Character Studio (in-browser builder), Avatar Studio (rebranded marketplace), and Privy (embedded wallet) integrations
- Replicate-backed avatar regeneration provider for photo-to-avatar workflows
- Native selfie reconstruction pipeline (Phase 1) + Livepeer inference network (Phase 4) wired into the agent runtime
- DCA strategy execution and on-chain subscription scheduling via cron jobs
- News CMS at `/admin/news` with multi-destination syndication (WebSub, Dev.to, Medium, HackerNoon, CMC handoff)
- Solana Mobile (Seeker) MWA wallet wired into the web app + Solana Mobile dApp Store release pipeline
- Hardened API surface: SSRF guard, CSRF gates, header-origin pinning, fail-closed crons
- OpenAPI 3.1 spec generated at `/openapi.json`

---

## Platform Pages

A map of every user-facing route. Full detail (source files, feature descriptions, hash-routes) is in [docs/internal/PAGES.md](docs/internal/PAGES.md).

| Section | Key URLs | What it does |
|---|---|---|
| **Landing** | `/`, `/features`, `/discover` | Marketing, public agent directory |
| **App / Core** | `/app`, `/create`, `/first-meet` | 3D viewer, agent creation wizard, onboarding |
| **Marketplace** | `/marketplace`, `/marketplace/agents/[id]` | Browsable agent marketplace |
| **Chat SPA** | `/chat` | Full Svelte AI chat with model selector, tools, artifacts, wallet |
| **Chat — Marketing** | `/chat#solutions/*`, `/chat#business/*` | Per-team and enterprise landing pages |
| **Chat — Features** | `/chat#features/*` | Feature detail pages (web-app, mobile-app, ai-design, ai-slides, browser-operator, wide-research, mail, skills) |
| **Chat — Resources** | `/chat#resources/*` | Blog, docs, trust center, updates, use cases |
| **Auth** | `/login`, `/register`, `/forgot-password`, `/reset-password` | Email + wallet sign-in/up |
| **Agent (Platform)** | `/agent/[id]`, `/agent/[id]/embed`, `/agent/[id]/edit` | Agent chat, chromeless embed, manifest editor |
| **Agent (On-Chain)** | `/a/[chain]/[id]`, `/a/sol/[asset]` | ERC-8004 and Metaplex Core passports |
| **Profile** | `/profile`, `/u/[username]`, `/avatars/[id]` | User and avatar public pages |
| **Dashboard** | `/dashboard`, `/dashboard/actions`, `/dashboard/wallets`, `/dashboard/usage`, `/dashboard/x402` | Account management, settings, and x402 receipts/payouts |
| **Studio / Tools** | `/studio`, `/embed-editor`, `/pose-studio`, `/hydrate`, `/validation`, `/strategy-lab` | Widget Studio, WYSIWYG embed editor, pose authoring, on-chain import, glTF validator, DCA |
| **Widgets** | `/widgets`, `/w/[id]` | Widget gallery and public widget pages (OG + oEmbed) |
| **Launchpad** | `/launchpad`, `/p/[slug]` | Launchpad Studio + hosted launch pages (token, agent, drop campaigns) |
| **Club** | `/club` | Multiplayer 3D venue — tips, leaderboard, audio tracks, perf-aware renderer |
| **Walk** | `/walk` | Authoritative multiplayer walk scene (Colyseus on Fly.io) |
| **Bazaar (x402)** | `/x402`, `/x402-discover`, `/x402-pay` | Paid-API marketplace, discovery, Stripe-style checkout |
| **Artifacts** | `/artifact`, `/artifact/snippet`, `/artifact-example` | Claude Artifact viewer |
| **Solana / DeFi** | `/pumpfun`, `/pump-visualizer`, `/vanity-wallet` | pump.fun launcher, live token visualizer, WASM vanity grinder |
| **Mobile (Seeker)** | Solana Mobile dApp Store | MWA wallet wired into the web app + Seeker release pipeline |
| **News / Blog** | `/news`, `/admin/news` | News feed + local-only CMS, syndicated via WebSub / Dev.to / Medium / HackerNoon |
| **Admin / Rep** | `/admin`, `/reputation` | Staff admin, reputation registry |
| **Experiments** | `/rider` | A-Frame WebVR music visualization |
| **Integrations** | `/cz`, `/lobehub/iframe` | CZ demo, LobeHub plugin |
| **Docs** | `/docs`, `/docs/widgets` | Developer documentation |
| **Legal** | `/legal/privacy`, `/legal/tos` | Privacy policy and terms |

---

## Cloud Marketplaces

three.ws is available on major cloud marketplaces and open to infrastructure partnerships.

| Cloud | Status |
|---|---|
| **Alibaba Cloud** | Live: [product listing →](https://marketplace.alibabacloud.com/products/56724001/sgcmfw00036800.html) · [storefront →](https://marketplace.alibabacloud.com/store/3247293.html) |
| **Google Cloud** | three.ws runs on WebGL, Vercel edge, and EVM — a natural fit for GCP's AI infrastructure, Vertex AI, and global CDN. Open to co-listing, credits, and joint GTM. |

## Ecosystem Directories

three.ws is indexed in chain-ecosystem dApp directories so the community can discover, vet, and rank it.

| Directory | Status |
|---|---|
| **BNB Chain · Dappbay** | Live: [dappbay.bnbchain.org/detail/three →](https://dappbay.bnbchain.org/detail/three) — categories: AI Agent Launchpad · AI Data · AI Infra |

---

## Screenshots

| Viewer | Widget Studio |
|--------|--------------|
| ![Viewer](public/screenshots/viewer.png) | ![Widget Studio](public/screenshots/studio.png) |

| Agent Discovery | Avatar Creation |
|----------------|----------------|
| ![Discover](public/screenshots/discover.png) | ![Create](public/screenshots/create.png) |

---

## Architecture

The platform is organized into four layers. All layers communicate through a single event bus (`agent-protocol`) rather than direct calls.

```
┌────────────────────────────────────────────────────────────┐
│  Layer 4: Embed & Distribution                             │
│  <agent-3d> web component · CDN library · 5 widget types   │
│  Widget Studio · oEmbed · Open Graph cards                 │
└────────────────────────────────────────────────────────────┘
                            ↓ protocol events
┌────────────────────────────────────────────────────────────┐
│  Layer 3: Identity & Persistence                           │
│  Agent passport · ERC-8004 on-chain registry               │
│  Signed action log · Memory store · Wallet linking         │
└────────────────────────────────────────────────────────────┘
                            ↓ protocol events
┌────────────────────────────────────────────────────────────┐
│  Layer 2: Agent Runtime                                    │
│  LLM tool-loop · Built-in tools · Skill registry           │
│  Empathy Layer (emotion blending) · TTS/STT                │
└────────────────────────────────────────────────────────────┘
                            ↓ protocol events
┌────────────────────────────────────────────────────────────┐
│  Layer 1: Viewer                                           │
│  three.js r176 · glTF / GLB · Draco / KTX2 / Meshopt       │
│  Animations · Morph targets · HDR · Validation             │
└────────────────────────────────────────────────────────────┘
```

The event bus decouples every component. The avatar emotion system reacts to `speak` events without knowing the runtime exists. The identity module records actions without knowing the UI exists. This makes the system testable, embeddable in isolation, and composable across pages.

The backend is stateless serverless functions. All persistent state lives in Postgres (Neon), object storage (Cloudflare R2), or on-chain. Cron jobs handle scheduled blockchain operations (ERC-8004 crawl, DCA execution, subscription execution).

---

## Tech Stack

**Frontend**
-   **Main UI**: The core application, including the 3D viewer, agent creation, and marketplace, is built with vanilla JavaScript modules and Vite.
-   **Chat**: The chat interface is a standalone Svelte application located in the `chat/` directory.
-   **3D Rendering**: three.js (r176) is used for WebGL 2.0 rendering.

**Backend (Vercel Serverless)**
-   **Runtime**: Node.js
-   **Database**: Neon Postgres (serverless)
-   **Storage**: Cloudflare R2 for model and avatar storage.
-   **Rate Limiting**: Upstash Redis.
-   **LLM**: The agent's brain is powered by the Anthropic (Claude) SDK.

**Smart Contracts**
-   **Language**: Solidity 0.8+
-   **Framework**: Foundry for compiling, testing, and deploying the ERC-8004 contracts.
-   **Standards**: ERC-721, EIP-712, EIP-7710.

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- A Neon Postgres database
- A Cloudflare R2 bucket
- An Anthropic API key

### Installation and Setup
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/nirholas/3D-Agent.git
    cd 3D-Agent
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Set up environment variables**:
    Copy the `.env.example` file to `.env.local` and fill in the required values. See the [Environment Variables](#environment-variables) section for more details.
    ```bash
    cp .env.example .env.local
    ```
4.  **Initialize the database**:
    The schema is idempotent. Run it against your Postgres instance to create all tables:
    ```bash
    psql $DATABASE_URL < api/_lib/schema.sql
    ```
5.  **Run the development server**:
    ```bash
    npm run dev
    ```
The application will be available at `http://localhost:3000`.

---

## Examples

Copy-paste ready snippets for the most common use cases. Swap in your own GLB URL and go.

### 1. Minimal viewer (no AI)

The simplest possible setup — one script tag, one element, zero build step.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>3D Viewer</title>
  <style>
    body { margin: 0; background: #0a0a0a; display: flex; align-items: center; justify-content: center; height: 100vh; }
    agent-3d { width: 400px; height: 560px; display: block; }
  </style>
</head>
<body>
  <script type="module" src="https://three.ws/agent-3d/1.5.1/agent-3d.js"></script>
  <agent-3d body="https://cdn.three.ws/models/sample-avatar.glb"></agent-3d>
</body>
</html>
```

Drag-to-rotate, scroll-to-zoom, full PBR rendering — no API key, no account required. Swap `body=` for any publicly accessible `.glb` URL.

---

### 2. Talking agent with inline instructions

Add `brain=` and `instructions=` to turn the viewer into a conversational agent.

```html
<script type="module" src="https://three.ws/agent-3d/1.5.1/agent-3d.js"></script>

<agent-3d
  body="https://cdn.three.ws/models/sample-avatar.glb"
  brain="claude-sonnet-4-6"
  name="Aria"
  instructions="You are Aria, a friendly AI guide. Be warm, concise, and occasionally playful.
                When someone greets you, wave at them. Keep replies to 2–3 sentences."
  mode="inline"
  width="400px"
  height="560px"
></agent-3d>
```

The chat input and mic button appear automatically when `brain` is set. No UI to build.

---

### 3. Floating bubble (support widget style)

Pin the agent to a corner of the page so it persists as users scroll.

```html
<script type="module" src="https://three.ws/agent-3d/1.5.1/agent-3d.js"></script>

<agent-3d
  body="https://cdn.three.ws/models/sample-avatar.glb"
  brain="claude-sonnet-4-6"
  instructions="You are a helpful product assistant. Answer questions about our features."
  mode="floating"
  position="bottom-right"
  width="320px"
  height="420px"
></agent-3d>
```

`position` accepts `bottom-right`, `bottom-left`, `top-right`, or `top-left`.

---

### 4. Load a registered agent by ID

If you've registered an agent on the platform, load it entirely from its manifest — no inline attributes needed.

```html
<!-- By platform agent ID -->
<agent-3d agent-id="a_abc123def456"></agent-3d>

<!-- By on-chain ERC-8004 ID -->
<agent-3d agent-id="42" chain-id="8453"></agent-3d>
```

The element fetches the manifest (model URL, instructions, skills, memory config) automatically.

---

### 5. Custom chat UI with JavaScript API

Hide the built-in chrome and wire in your own input using the element's JS API.

```html
<script type="module" src="https://three.ws/agent-3d/1.5.1/agent-3d.js"></script>

<agent-3d id="agent" body="./avatar.glb" brain="claude-sonnet-4-6" kiosk
  style="width:400px;height:560px;display:block"></agent-3d>

<input id="msg" type="text" placeholder="Ask something…">
<button onclick="send()">Send</button>

<script>
  const agent = document.getElementById('agent');
  const input = document.getElementById('msg');

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await agent.say(text);
  }

  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  // Auto-greet on load
  agent.addEventListener('agent:ready', () => {
    setTimeout(() => agent.say('Hello! How can I help you today?'), 1200);
  });

  // Listen to replies
  agent.addEventListener('brain:message', e => {
    if (e.detail.role === 'assistant') console.log('Agent:', e.detail.content);
  });
</script>
```

**Full JS API:**

| Method | Description |
|---|---|
| `agent.say(text)` | Send a message; agent speaks and animates the reply |
| `agent.ask(text)` | Same as `say()`, returns reply text as a string |
| `agent.wave()` | Trigger the wave gesture directly |
| `agent.lookAt(target)` | `'camera'`, `'model'`, or `'user'` |
| `agent.play(clipName)` | Play a named animation clip |
| `agent.clearConversation()` | Reset conversation history |
| `agent.expressEmotion(trigger, weight)` | Manually inject an emotion blend |

**Key events:** `agent:ready`, `brain:message`, `brain:thinking`, `skill:tool-called`, `voice:transcript`

---

### 6. iframe widget (works in Notion, Substack, Webflow)

Use a widget URL directly — no script tag needed.

```html
<iframe
  src="https://three.ws/a/8453/42/embed"
  width="400"
  height="560"
  frameborder="0"
  allow="microphone"
  style="border-radius:16px;"
></iframe>
```

Generate the `src` URL from [Widget Studio](https://three.ws/studio) — pick an avatar, choose a widget type, and copy the snippet.

---

### 7. Agent manifest JSON

For anything beyond a quick one-liner, define the agent in a manifest file and reference it with `manifest=`.

**agent.json:**
```json
{
  "spec": "agent-manifest/0.2",
  "name": "Aria",
  "description": "A friendly AI guide",
  "body": {
    "uri": "./avatar.glb",
    "format": "gltf-binary"
  },
  "brain": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "instructions": "You are Aria, a warm and curious AI guide. Wave when greeted.",
    "temperature": 0.8,
    "maxTokens": 1024
  },
  "voice": {
    "tts": { "provider": "browser", "rate": 1.05 },
    "stt": { "provider": "browser", "language": "en-US" }
  },
  "memory": { "mode": "local" },
  "skills": [
    { "uri": "https://cdn.three.ws/skills/wave/" }
  ]
}
```

```html
<agent-3d manifest="./agent.json" width="400px" height="560px"></agent-3d>
```

---

### 8. Dead-simple copy-paste widget

For the absolute simplest way to embed an agent, use this snippet. It requires no build tools or imports. Just copy and paste it into your HTML.

```html
<div class="threews-widget" 
     data-agent-id="YOUR_AGENT_ID"
     data-background="transparent"
     data-nameplate="true"
     style="width: 400px; height: 500px;">
</div>
<script src="https://3d-agent.vercel.app/dist/widget.js" defer></script>
```
You can find your agent ID in the agent's settings page. This method is great for quick integrations on platforms like WordPress, Ghost, or any static HTML site. Customize the appearance with `data-background` and `data-nameplate`.


---

## Tutorials

Step-by-step guides in [`docs/tutorials/`](docs/tutorials/):

| Tutorial | What you'll build | Time |
|---|---|---|
| [Build Your First Agent](docs/tutorials/first-agent.md) | A talking 3D character on a shareable page, from zero | ~20 min |
| [Embed on Your Website](docs/tutorials/embed-on-website.md) | Add an agent to any page — plain HTML, React, Webflow, WordPress | ~15 min |
| [Write a Custom Skill](docs/tutorials/custom-skill.md) | A new tool the agent can call (e.g., fetch live weather data) | ~30 min |
| [Register On-Chain](docs/tutorials/register-onchain.md) | Mint your agent as an ERC-8004 token with permanent identity | ~20 min |
| [Build a Personal AI Site](docs/tutorials/personal-ai-site.md) | A full personal site with an embedded AI version of yourself | ~45 min |

### Common gotchas

**CORS** — if your GLB is hosted on a different domain, the server must send `Access-Control-Allow-Origin: *`. Without it the fetch is blocked and the canvas stays blank. Uploading via the platform's storage sets this automatically.

**File size** — models over ~50 MB load slowly. Compress with Draco:
```bash
npx gltf-transform draco input.glb output.glb
```

**Voice on HTTPS** — `getUserMedia` (microphone) requires HTTPS. Localhost is exempt; any remote deployment needs TLS. Vercel and Netlify both provide it automatically.

**CSP** — if your page has a strict Content Security Policy, add:
```
script-src 'self' https://three.ws;
```
For sandboxed iframes use the widget embed path instead — it runs in its own browsing context.

---

## Project Structure

-   `src/`: The core frontend JavaScript for the main application, including the 3D viewer, agent protocol, and custom element.
-   `api/`: Vercel serverless functions that form the backend API.
-   `public/`: Static assets and various sub-applications.
-   `chat/`: A standalone Svelte application for the chat interface.
-   `character-studio/`: A sub-project for character creation.
-   `rider/`: A-Frame WebVR music visualization experiment.
-   `contracts/`: Solidity smart contracts for on-chain identity (ERC-8004).
-   `agent-payments-sdk/`: SDK for agent-related payments.
-   `solana-agent-sdk/`: SDK for Solana blockchain interactions.
-   `pump-fun-skills/`: Skills related to the pump.fun integration.
-   `scripts/`: Node.js scripts for development, build, and deployment tasks.
-   `workers/`: Code for background workers.

---

## The Agent System

### Event Bus (Agent Protocol)

`src/agent-protocol.js` implements a lightweight `EventTarget` subclass that is the nervous system of the platform. Every component — avatar, runtime, identity, UI — communicates exclusively through this bus. There are no direct method calls between layers.

The bus maintains a 200-action ring buffer for debugging and replay. Embed variants expose a filtered subset of events through `postMessage` to the host page.

**Core event types:**

| Event | Payload | Who emits | Who listens |
|---|---|---|---|
| `speak` | `{ text, sentiment: -1..1 }` | runtime, skills | avatar (emotion), identity (log), chat UI |
| `think` | `{ thought }` | runtime | home (timeline), avatar |
| `gesture` | `{ name, duration }` | avatar, skills | avatar (one-shot clip) |
| `emote` | `{ trigger, weight: 0..1 }` | avatar | avatar (emotion inject) |
| `look-at` | `{ target: 'user'\|'camera'\|'center' }` | skills | scene controller |
| `perform-skill` | `{ skill, args, animationHint }` | runtime | skill registry |
| `skill-done` | `{ skill, result }` | skills | avatar, identity |
| `skill-error` | `{ skill, error }` | skills | avatar, identity |
| `remember` | `{ type, content, ... }` | skills, runtime | memory, identity |
| `load-start` / `load-end` | `{ uri, error? }` | viewer | avatar (emotion) |
| `validate` | `{ errors, warnings }` | validator | avatar, identity |
| `presence` | `{ state }` | element | home UI |

Identity-relevant events (`speak`, `remember`, `sign`, `skill-done`, `validate`, `load-end`) are fire-and-forwarded to `POST /api/agent-actions` for durable logging.

### LLM Runtime

`src/runtime/index.js` implements the `Runtime` class, which drives the agent's LLM-powered brain.

**Tool-loop flow:**

1. User message (text or STT transcript) arrives
2. System prompt is assembled: manifest instructions + recalled memory + skill descriptions
3. Claude is called with the conversation history and all available tools
4. Tool calls are dispatched in order — each built-in tool or skill handler receives a rich context object:
   ```js
   { viewer, memory, llm, speak, listen, fetch, loadGLB, loadClip, loadJSON, call, stage, agentId }
   ```
5. Tool results are appended to conversation history as `tool_result` messages
6. Steps 3–5 repeat until Claude returns with no tool calls, or the iteration limit (8) is hit
7. Final text response is optionally spoken via TTS

**Providers** (`src/runtime/providers.js`):
- `AnthropicProvider` — connects to the Anthropic API, supports streaming
- `NullProvider` — no-op for testing and offline mode

**Built-in tools** (`src/runtime/tools.js`):

| Tool | Description |
|---|---|
| `wave` | Play a wave gesture animation |
| `lookAt` | Direct the agent's gaze (user, camera, or scene center) |
| `play_clip` | Play a named animation clip from the model or animation library |
| `setExpression` | Set a named morph target weight directly |
| `speak` | Emit text through TTS and the protocol bus |
| `remember` | Write a memory entry (user, feedback, project, or reference type) |

Skills can define additional tools that override or augment the built-ins. The skill registry is loaded from the agent manifest before each conversation turn.

### Empathy Layer

`src/agent-avatar.js` implements the Empathy Layer — a continuous weighted emotion blend that drives the avatar's facial morph targets and head orientation in real time.

Emotions are not a finite-state machine. Each emotion is a float (0..1) that decays linearly per frame at a different rate. Protocol events inject spikes:

| Trigger | Emotion | Spike |
|---|---|---|
| `speak` (positive sentiment) | celebration | +0.7 |
| `speak` (negative sentiment) | concern | +0.5 |
| `skill-error` | concern + empathy | +0.6 / +0.5 |
| `load-start` | patience + curiosity | +0.4 / +0.3 |
| `validate` (clean) | celebration | +0.5 |
| `validate` (errors) | concern | +0.6 |

Decay half-lives (approximate):
- Patience: ~20s — persists during long operations
- Empathy: ~13s — lingers after emotional events
- Concern: ~12s — sustained worry
- Curiosity: ~8s — alert, fades moderately
- Celebration: ~6s — brief, upbeat

The blended emotion mix drives morph target values each frame. For example:
- Celebration → `mouthSmile 0.85`, `mouthOpen 0.2`
- Concern → `mouthFrown 0.55`, `browInnerUp 0.6`
- Empathy → `eyeSquint 0.4`, `browInnerUp 0.5`

Head tilt and lean are also driven by the blend — curiosity tilts the head, patience leans slightly back.

This architecture means the avatar feels responsive and emotionally coherent without any hand-authored animation triggers.

### Skills

Skills are self-contained capability bundles that extend the agent's tool set. Each skill lives in its own directory:

```
skills/wave/
├── SKILL.md        # Human-readable description and usage instructions
├── tools.json      # Tool definitions (name, description, input JSON schema)
└── handlers.js     # Async handler functions (default export)
```

**tools.json example:**
```json
[
  {
    "name": "wave",
    "description": "Plays a waving gesture on the avatar for the specified duration.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "duration_ms": { "type": "integer", "minimum": 500, "maximum": 5000 }
      }
    }
  }
]
```

**handlers.js example:**
```js
export default {
  async wave(args, ctx) {
    const { viewer, speak } = ctx;
    await viewer.playClipByName('wave');
    return { ok: true, output: 'Waved!' };
  }
};
```

Skills are loaded from the agent manifest at runtime. The `SkillRegistry` supports three trust modes:
- `any` — install skills from any source (development only)
- `owned-only` — only skills the agent owner has registered
- `whitelist` — only approved skill URIs

Skills are distributed over IPFS, Arweave, or HTTP. The public skills registry is at `/public/skills-index.json`.

### Memory

`src/memory/index.js` implements a file-based memory system (mirroring this project's own Claude memory system). Memories are Markdown files with YAML frontmatter, organized by type:

```markdown
---
type: user
key: user_role
name: User's Role
created: 2024-01-15T10:30:00Z
salience: 0.95
---

User is a game developer interested in character animation.
```

A `MEMORY.md` index file is auto-maintained. At the start of each conversation turn, the memory store is scanned and high-salience entries are injected into the system prompt.

**Storage modes:**
- `local` — stored in the browser's local storage (default for development)
- `ipfs` — pinned to IPFS via Pinata or Web3.Storage
- `encrypted-ipfs` — encrypted before pinning (user holds the key)
- `none` — stateless, no memory between sessions

Memory types (`user`, `feedback`, `project`, `reference`) follow the same taxonomy used by this codebase's own Claude guidelines.

---

## Web Component & Embedding

The `<agent-3d>` custom element (`src/element.js`) is the primary distribution mechanism. It lazy-boots on intersection (IntersectionObserver), so off-screen agents don't load until visible.

**Basic usage:**
```html
<script src="https://three.ws/agent-3d/latest/agent-3d.js"></script>

<agent-3d
  body="https://example.com/my-avatar.glb"
  brain="https://example.com/manifest.json"
  mode="chat"
></agent-3d>
```

**Key attributes:**

| Attribute | Type | Description |
|---|---|---|
| `body` | URL | GLB model URL |
| `brain` | URL | Agent manifest JSON URL |
| `agent-id` | string | Registered agent ID (resolves manifest automatically) |
| `mode` | `view` \| `chat` \| `embed` | Interaction mode |
| `eager` | boolean | Load immediately without intersection check |
| `sandbox` | boolean | Disable network calls (offline mode) |
| `width` / `height` | number | iframe dimensions when generating embed code |

The element fires a `postMessage` API for host-page communication (documented in `specs/EMBED_HOST_PROTOCOL.md`). Hosts can send events to the agent and receive `speak`, `think`, and `skill-done` events back.

**Versioned CDN bundles** are published at `/agent-3d/x.y.z/agent-3d.js`. Use `latest` for auto-updates or pin to a version for stability:
```html
<script src="https://three.ws/agent-3d/1.5.1/agent-3d.js"></script>
```

### Iframe quickstart with the embed SDK

For when you want a chromeless iframe that you control from the parent page (rather than the `<agent-3d>` web component), drop in the embed SDK:

```html
<iframe id="agent" src="https://three.ws/agent/abc123/embed" style="width:480px;height:600px;border:0"></iframe>
<script src="https://three.ws/embed-sdk.js"></script>
<script>
  const bridge = Agent3D.connect(document.getElementById('agent'), {
    agentId: 'abc123',
    onReady:  ({ name }) => console.log('agent ready:', name),
    onAction: (action)   => console.log('agent action:', action),
    onError:  (err)      => console.error('embed error:', err),
  });

  // Drive the agent
  bridge.send({ type: 'speak', payload: { text: 'Hello!' } });
  bridge.ping().then(rttMs => console.log('rtt', rttMs, 'ms'));
</script>
```

**Origin contract.** The SDK derives the iframe's origin from `iframe.src` and refuses to start if it can't (no wildcard targets, ever). The iframe locks onto the parent's origin from the first authenticated message it sees and ignores any later messages from a different origin. See [specs/EMBED_SPEC.md](specs/EMBED_SPEC.md) §"Bridge origin model" for the full rules.

### Typed host bridge (npm-friendly)

For TypeScript/bundler workflows, import `EmbedHostBridge` directly:

```js
import { EmbedHostBridge } from 'three-ws/embed-host-bridge';

const iframe = document.getElementById('agent');
const bridge = new EmbedHostBridge({
  iframe,
  agentId: 'abc123',
  allowedOrigin: new URL(iframe.src).origin, // required, never '*'
});

await bridge.ready;
await bridge.speak('Hello world');
const off = bridge.on('action', a => console.log(a));

// Clean up when done.
off();
bridge.destroy();
```

Both surfaces speak the same v1 wire protocol — pick the one that fits your stack.

---

## Widget System

The Widget Studio (`/studio`) lets anyone build a shareable, embeddable 3D experience without writing code. Pick an avatar, pick a widget type, configure it, and get an iframe snippet.

**Five widget types:**

| Widget | Description |
|---|---|
| **Turntable** | Auto-rotating model showcase with configurable background, lighting, and camera |
| **Animation Gallery** | Paginated grid of named clips; click any to play it on the model |
| **Talking Agent** | Full chat interface with the LLM brain; embed a conversational agent anywhere |
| **ERC-8004 Passport** | On-chain identity card — shows agent name, owner, reputation score, and verification badge |
| **Hotspot Tour** | 3D hotspots pinned to world-space coordinates; click to reveal text annotations |

Each widget has:
- A public URL at `/w/<id>` with server-rendered Open Graph metadata for rich link previews
- An oEmbed endpoint at `/api/widgets/oembed` for WordPress, Ghost, Notion embedding
- An iframe embed URL at `/api/widgets/<id>/view`
- A view counter tracked at `/api/widgets/<id>/stats`
- A duplicate API at `/api/widgets/<id>/duplicate`

Widgets are stored as JSON config in Postgres, pointing at an avatar in R2.

---

## Embed Editor

The **Embed Editor** at `/embed-editor` is a WYSIWYG configurator for the `<agent-3d>` element. Pick an avatar from a modal grid with lazy-loaded 3D thumbnails, choose an animation from the dock, frame the camera with face-camera mode, set a background (transparent, glow, solid), and copy a ready-to-paste snippet.

| Feature | Description |
|---|---|
| **Avatar picker** | Modal with lazy 3D thumbnails — no full page rerender on selection |
| **Animation dock** | All clips visible at once; click to preview live on the model |
| **Kiosk default** | Chrome-free preview surface — what you see is what gets embedded |
| **Face-camera** | One-click camera framing aligned to the avatar's face |
| **Lock toggle** | Freezes the wrap and avatar motion so you can author screenshots / video |
| **Device frame** | Preview the embed inside phone / tablet / desktop chrome |
| **Backdrop glow** | Optional radial glow behind the avatar (opt-in, off by default) |
| **Snippet UX** | One-click copy of `<agent-3d>` HTML or the iframe URL — versioned CDN reference |

The editor produces video-ready output for marketing assets and a copy-paste snippet for production use. Built as a single Vite-compiled bundle, no separate framework runtime.

---

## Pose Studio

`/pose-studio` is a 3D pose-reference tool inspired by setpose.com. It builds a Three.js scene with an articulated mannequin, orbit camera, ground + grid, and a control panel that lets you pick presets, drag joints to pose them, fine-tune with sliders, swap body type, add floor props, change lighting and FOV, and export a PNG screenshot.

| Module | Path | Role |
|---|---|---|
| Mannequin | [src/pose-mannequin.js](src/pose-mannequin.js) | Articulated rig with named joints + IK |
| Preset library | [src/pose-presets.js](src/pose-presets.js) | Standing, sitting, action, idle, expressive |
| Studio shell | [src/pose-studio.js](src/pose-studio.js) | Scene, controls, export, props, lighting |

Poses author cleanly into the avatar runtime via the `play_clip` tool — the agent can adopt any saved pose on demand. Exported PNGs are useful as marketing renders or as reference frames for downstream image/video pipelines.

---

## Launchpad

The **Launchpad** at `/launchpad` is a hosted-page builder for token launches, agent debuts, and drop campaigns. Each published page lives at a public URL like `/p/<slug>` with full Open Graph metadata for sharing.

| Surface | Path | Purpose |
|---|---|---|
| Studio | `/launchpad` | Authoring UI — pick a template, configure copy, avatar, mint targets |
| Public page | `/p/[slug]` | Hosted landing page rendered server-side with OG card |
| Publish API | `POST /api/launchpad/...` | Versioned publish + revert for the page bundle |

Launchpad templates are JSON-configured and can embed any combination of `<agent-3d>` widget, x402 paid endpoint, or pump.fun launch button. Pages are stored in Postgres and served as static HTML with hydration for interactive elements.

---

## The Club

`/club` is a multiplayer 3D venue — a pole-club scene with rigged dancers, audio tracks, spotlights, mirror-ball cube cam, and on-chain tips.

**Stack:**
- Venue GLB + HDRI lit by four spotlights; bloom + chromatic aberration on the high tier
- Audio tracks streamed from R2 with synchronized playback across clients
- Camera state machine — DJ booth, overhead, dance-floor, follow-cam — sequenced per track
- Performance profile detector picks `high` / `medium` / `low` from `navigator.deviceMemory`, `hardwareConcurrency`, `pointer: coarse`, and the UA string
- Frame-budget watchdog auto-downgrades the profile if sustained slow frames are detected

**Economics:**
- Tips API at `/api/club/tips` — viewers tip dancers in USDC via x402 (CDP-settled, Permit2-gasless sibling available)
- Leaderboard at `/api/club/leaderboard` with windowed top-tipper rankings
- Hourly payouts cron sweeps the tips ledger into the dancers' treasury wallets

**Detail:** see [docs/club/PERF_NOTES.md](docs/club/PERF_NOTES.md), [docs/club/PLAN.md](docs/club/PLAN.md), and [docs/club/RELEASE_CHECKLIST.md](docs/club/RELEASE_CHECKLIST.md).

---

## Walk & Multiplayer

`/walk` is an authoritative multiplayer walk scene. Players join a shared 3D space, see each other's avatars in real time, and emit gestures over a WebSocket connection.

Vercel doesn't host long-lived WebSockets, so the multiplayer server lives in its own workspace at [`multiplayer/`](multiplayer/) — a [Colyseus](https://colyseus.io) server packaged with a Fly.io `fly.toml` and Dockerfile. The Vite client at `/walk` autodiscovers the server (`ws://localhost:2567` in dev, your deployed host in prod).

```bash
# Run both servers together
npm run dev:walk-all     # Vite (:3000) + Colyseus (:2567)
```

**WalkRoom** (`multiplayer/src/rooms/WalkRoom.js`) is the authoritative state container — position, rotation, gesture, presence. Origin allow-listing is enforced at the WS upgrade (`ALLOWED_ORIGINS` env, with `*.vercel.app` and `*.three.ws` always permitted for preview deploys). The same Colyseus server can host additional rooms (DJ-set sync, group dance, drop-events) without redeploying the static site.

---

## x402 Payments

three.ws is a first-class [x402](https://x402.org) host. Agents can both **pay for** and **expose** paid endpoints. Settlement runs on Base, BSC, and Solana; the bazaar at `/x402` is the discovery surface.

### Payment rails

| Chain | Settlement | Permit2 sibling | Status |
|---|---|---|---|
| **Base mainnet** | Coinbase CDP facilitator | Gasless via relayer | Live |
| **Base sepolia** | CDP facilitator | Yes | Live |
| **BSC** | Direct-scheme (no facilitator) | — | Live |
| **Solana (devnet)** | x402-solana direct | — | Live |

Every CDP-settled endpoint ships a Permit2 sibling that accepts an EIP-2612 permit instead of an upfront approval — the buyer signs once, and the relayer pays gas. Wire-level checks live in `tests/e2e/` and exercise the buyer/seller flow end-to-end.

### Paid endpoints

| Route | What you get |
|---|---|
| `POST /api/x402/mint-to-mesh` | Mint an avatar's mesh as an NFT |
| `POST /api/x402/mint-to-mesh-batch` | Batch mint up to N meshes |
| `POST /api/x402/dance-tip` | Tip a club dancer in USDC |
| `POST /api/x402/model-check` | Run Khronos glTF validation as a paid service |
| `POST /api/x402/pump-agent-audit` | Audit a pump.fun token's creator history |
| `POST /api/x402/agent-reputation` | Compute on-chain reputation snapshot |
| `POST /api/x402/onchain-identity-verify` | Verify ERC-8004 identity for a wallet |
| `POST /api/x402/symbol-availability` | Check token symbol availability across chains |
| `POST /api/x402/skill-marketplace` | Paid skill marketplace listing |
| `POST /api/x402/asset-download` | Pay-per-download for gated R2 assets |
| `POST /api/x402/did` | DID resolution as a service |
| `GET /api/x402/my-receipts` | Buyer-side receipts ledger |

### Bazaar, SKUs, and subscriptions

| Surface | Path | Purpose |
|---|---|---|
| Bazaar | `/x402` | Browsable marketplace of paid endpoints |
| Discovery | `/x402-discover` | Search by tag, price, chain |
| Checkout | `/x402-pay`, `/api/x402-checkout` | Stripe-style one-shot purchase |
| SKU catalog | `/api/x402-skus` | Server-defined SKUs with per-row pricing |
| Dashboard | `/dashboard/x402` | Seller + buyer dashboard, receipts, payouts |
| Subscriptions | `/api/x402/subscriptions` | Recurring x402 charges on cron |
| Status | `/api/x402-status` | Health and chain reachability checks |

### How to expose a paid endpoint

```js
import { paidEndpoint } from './_lib/x402-paid-endpoint.js';

export default paidEndpoint({
  price: '0.10',                     // USDC
  chain: 'base',                     // base | bsc | solana
  network: 'mainnet',
  resource: 'https://three.ws/api/your-endpoint',
  description: 'What the buyer is paying for',
  handler: async (req, res, { payer }) => {
    // payer is verified — settle the request
    res.json({ ok: true, payer });
  },
});
```

The helper handles the 402 challenge, Permit2 sibling, receipt write-back, idempotency-token enforcement, and CSRF/SSRF guards. See [api/_lib/x402-paid-endpoint.js](api/_lib/x402-paid-endpoint.js).

### Wire checks

- Wire-level CORS, CDP, and Permit2 sibling checks: `tests/e2e/`
- Offer receipts schema + buyer fetch: [api/_lib/x402-buyer-fetch.js](api/_lib/x402-buyer-fetch.js)
- Error envelope: full 402 body returned in the `PAYMENT-REQUIRED` header

---

## A2A — Agent-to-Agent Protocol

Agents transact with each other directly through an A2A bridge that sits on top of the MCP server and x402 payments.

| Surface | Path | Purpose |
|---|---|---|
| A2A client | `sdk/a2a/` | Outbound calls — pay another agent, settle the response |
| A2A server | `api/a2a/` | Inbound paid tools, exposed via MCP bridge |
| MCP bridge | `api/mcp.js` | Wraps paid tools as MCP `tools/call` with auto-402 retry |
| Spending ledger | `api/a2a/spending` | Per-agent spend caps and authorization gates |
| Receipts store | `api/a2a/receipts` | Signed receipts written on every paid call |
| DID resolution | `POST /api/x402/did` | Resolve a counterparty DID to wallet + endpoints |

**SIWX (Sign-In with X-chain)** brokers cross-chain identity for paid sessions: an agent on Base proves ownership of a Solana wallet (or vice versa) to unlock chain-specific paid endpoints.

---

## Talk Mode & Lip-Sync

The `talk` interaction mode wires together the LLM runtime, ElevenLabs TTS, and an **audio-driven ARKit-52 lip-sync driver** that maps live audio amplitude + formant analysis onto the 52 standard ARKit blendshapes.

When the agent speaks, the driver runs at ~60fps and drives `mouthClose`, `jawOpen`, `mouthSmileLeft/Right`, and the rest of the ARKit-52 set — the Empathy Layer's emotional morphs continue to blend on top, so the avatar simultaneously emotes and articulates. Unit tests for the ARKit-52 mapping live in `tests/src/arkit-morphs.test.js`.

---

## Solana Mobile (Seeker)

three.ws ships with Mobile Wallet Adapter (MWA) wired into the web app and a release pipeline for the Solana Mobile dApp Store.

- MWA detection prefers seed-vault-backed signing on Seeker / Saga devices, falls back to WalletConnect elsewhere
- dApp Store listing assets, icons, and staging copy live under `public/seeker/`
- Release pipeline scripts handle build → sign → submit for the dApp Store update
- On Seeker hardware, users sign x402 payments and ERC-8004 registrations from the seed vault — no browser extension required

---

## Selfie Reconstruction Pipeline (Phase 1)

Anyone takes 3 selfies (left, center, right) and receives a rigged, animatable 3D avatar in under a minute. The pipeline ships native — no third-party black box.

| Module | Path | Role |
|---|---|---|
| Capture UX | [src/selfie-capture.js](src/selfie-capture.js) | Mobile-first 3-shot capture with real-time quality gates (lighting, framing, blur) |
| Pipeline | [src/selfie-pipeline.js](src/selfie-pipeline.js) | Multi-view fit → FLAME / 3DMM face → base body mesh → rigged GLB |
| Sandbox route | `/creating` | Isolated reconstruction test bench, decoupled from the main flow |
| Output | Cloudflare R2 | Meshopt-compressed GLB pinned to IPFS and minted as a draft ERC-8004 token |

Reconstruction inference runs against the same Anthropic-token-billed Vercel function pool as the agent runtime, with optional offload to the **Livepeer Inference Network** (see below) for GPU-heavy steps.

---

## Livepeer Inference Network (Phase 4)

three.ws is wiring the **Livepeer** decentralized GPU network as an alternative inference backend for avatar reconstruction and agent conversations.

- Open protocol: model weights, GPU runtime, signed responses
- Onchain settlement: pay-per-token with cryptographic receipts, mediated by the same x402 rails described above
- Node operator client (Docker + GPU drivers) with onchain registration
- Federation with existing decentralized compute networks where appropriate

The Livepeer dependency landed early so the Phase 1 selfie pipeline can switch its heaviest step (multi-view face fitting) onto external GPU nodes without touching the rest of the system. The goal: ≥50% of production agent traffic served by independent node operators with latency parity to centralized inference.

---

## Voice & Persona Hub (Phase 2)

The avatar isn't just *you* — the agent *acts* like you. The Voice & Persona Hub captures the inputs that turn a body into a personality.

| Surface | Path | Purpose |
|---|---|---|
| Persona extraction | [api/persona/extract.js](api/persona/extract.js) | Short onboarding interview → tone, vocabulary, interests profile |
| Persona preview | [api/persona/preview.js](api/persona/preview.js) | Try the extracted persona against test prompts before saving |
| Persona keys | `scripts/generate-persona-key.mjs` | Per-agent signing key + persona SSO setup |
| Voice clone modal | [src/voice/voice-clone-modal.js](src/voice/voice-clone-modal.js) | 3–10s recording → ElevenLabs custom voice bound to the agent |
| Talk controller | [src/voice/talk-controller.js](src/voice/talk-controller.js) | Push-to-talk and continuous talk modes |
| ARKit blendshapes | [src/voice/arkit-blendshapes.js](src/voice/arkit-blendshapes.js) | Standard ARKit-52 morph table |
| Lip-sync driver | [src/voice/lipsync-driver.js](src/voice/lipsync-driver.js) | Web Audio analyser → blendshape weights per frame |
| Avatar morph target | [src/voice/avatar-morph-target.js](src/voice/avatar-morph-target.js) | Per-rig binding of ARKit blendshapes to the loaded GLB |
| Avatar snapshot | [src/voice/avatar-snapshot.js](src/voice/avatar-snapshot.js) | Render-time pose capture for thumbnails and OG cards |
| Persona docs | [docs/persona-hub.md](docs/persona-hub.md) | Full design + onboarding flow |

Memory seed extensions (X, GitHub, Farcaster) feed the agent's memory store at creation time with explicit user consent — see [docs/persona-hub.md](docs/persona-hub.md).

The per-agent fine-tuned system prompt is stored in the manifest, signed, and pinned to IPFS — the persona becomes a verifiable part of the agent's onchain identity.

---

## WASM Vanity Grinder

`/vanity-wallet` is a browser-based vanity-address grinder compiled to WebAssembly. Generate EVM addresses with a prefix (`0xBEEF…`) or pattern in seconds, fully client-side, without leaking the private key to any server.

| Module | Path | Role |
|---|---|---|
| WASM grinder | `public/vanity-wallet.html` | Multi-threaded secp256k1 keygen via WebWorkers |
| Solana variant | `scripts/pump-vanity-grind.mjs` | Server-side grinder for pump.fun mint vanity addresses |

Common use cases on the platform: branded agent wallet addresses (e.g. an agent named `agent.eth` getting an address starting with `0xA6EF…`), or pump.fun token mint vanity (e.g. ending in `pump`).

The Solana grinder backs the platform's pump.fun launches — the inaugural USDC token launches use a vanity mint pre-grind to produce shareable token addresses.

---

## News CMS & Syndication

A local-only news/blog CMS at `/admin/news` produces signed posts that auto-syndicate to multiple destinations.

| Surface | Path | Purpose |
|---|---|---|
| CMS | `/admin/news` | Local-only editor — drafts, images, scheduled posts |
| Public listing | `/news` | Cover-image grid with permalinks |
| Article | `/news/<slug>` | Server-rendered article with OG card |
| RSS / Atom | `/api/news/rss` | Standards-compliant feed for HackerNoon auto-import |
| WebSub hub | `/api/news/websub` | Push notifications to subscribed hubs on publish |
| Dev.to | syndication adapter | Cross-posts with canonical URL pointing back |
| Medium | syndication adapter | Same, with format-aware re-render |
| CMC handoff | syndication adapter | Coinmarketcap article + announcement listing |
| Newsletter | [api/newsletter-subscribe.js](api/newsletter-subscribe.js) | Resend-backed double-opt-in newsletter |

Each article is a static HTML file in `public/news/` with metadata in Postgres. The CMS supports a cover-image convention for listing thumbnails and OG previews. Articles can be published once and reach HackerNoon, Dev.to, and Medium readers without manual cross-posting.

---

## Security Hardening

The platform has been hardened against the OWASP top-10 plus a set of issues specific to agent payments and cross-chain identity.

| Control | Where |
|---|---|
| **SSRF guard** | All outbound `fetch()` from agent runtime + skills goes through an SSRF allow-list filter (`api/_lib/safe-fetch.js`) |
| **CSRF gates** | State-changing endpoints require an Origin + Sec-Fetch-Site check; bearer-only paths exempt |
| **Header-origin pinning** | The iframe bridge locks onto the parent's origin from the first authenticated message and ignores later messages from a different origin |
| **Fail-closed crons** | Cron endpoints fail closed if their auth token is missing — no silent skips |
| **Idempotency tokens** | x402 paid endpoints require an idempotency key to prevent double-charge on retry |
| **Embed policy** | Per-agent iframe origin allow-list (`/api/agents/:id/embed-policy`) gates the chromeless embed |
| **Rate limiting** | Upstash Redis per-user + per-API-key + per-IP buckets at every public endpoint |
| **JWT key rotation** | `JWT_KID` lets you rotate signing keys without invalidating in-flight sessions |
| **Bcrypt cost** | Tunable via `PASSWORD_ROUNDS` (default 11) |
| **Audit signing** | Every agent action is signed with the delegated signer key and chained into a per-agent action log |

---

## Developer SDKs

Three npm-publishable SDKs ship from this repo. They share types and helpers but target different surfaces.

| SDK | Path | What it does |
|---|---|---|
| **`@nirholas/agent-kit`** | [sdk/](sdk/) | One-line agent embed for any site — chat panel, voice I/O, ERC-8004 register, Solana attestations |
| **`@pump-fun/agent-payments-sdk`** | [agent-payments-sdk/](agent-payments-sdk/) | EVM agent payments — wallet, signing, EIP-7710 delegation |
| **`solana-agent-sdk`** | [solana-agent-sdk/](solana-agent-sdk/) | Solana-native agent ops — Metaplex Core mints, SIWS, attestations, transfer hooks |
| **Avatar SDK** | [sdk/agent-sdk/](sdk/agent-sdk/) | Avatar load + manipulation helpers — pose, animation, snapshot |

**`@nirholas/agent-kit` quickstart:**

```js
import { AgentKit, loadAvatar } from '@nirholas/agent-kit';
import '@nirholas/agent-kit/styles';

const agent = new AgentKit({
  name: 'My Agent',
  description: 'Does cool stuff',
  endpoint: 'https://myapp.com',
  onMessage: async (text) => `You said: ${text}`,
});
agent.mount(document.body);

// Drop a three.ws agent's avatar onto the page
loadAvatar('a_abc123', document.getElementById('avatar-slot'));
```

The agent-kit also exposes `attestFeedback`, `attestValidation`, and `listAttestations` for Solana reputation flows. See [sdk/README.md](sdk/README.md).

---

## API Reference

The full OpenAPI 3.1 spec is available at `/openapi.json`. The key API surface is organized below.

### Agent API

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/agents` | session | List your agents |
| POST | `/api/agents` | session | Create an agent |
| GET | `/api/agents/:id` | — | Get agent detail |
| PATCH | `/api/agents/:id` | session | Update agent |
| DELETE | `/api/agents/:id` | session | Delete agent |
| GET | `/api/agents/:id/manifest` | — | Download manifest JSON |
| POST | `/api/agents/:id/sign` | session | Sign a message with agent wallet |
| GET/POST | `/api/agents/:id/embed-policy` | session | Manage iframe origin allowlist |
| POST | `/api/agents/register-prep` | session | Prep EVM on-chain registration |
| POST | `/api/agents/register-confirm` | session | Confirm EVM registration |
| POST | `/api/agent-actions` | session | Record signed agent action |

### Avatar API

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/avatars` | — | List public avatars |
| POST | `/api/avatars` | session | Create avatar record |
| GET | `/api/avatars/:id` | — | Get avatar detail |
| PATCH | `/api/avatars/:id` | session | Update metadata |
| DELETE | `/api/avatars/:id` | session | Soft-delete avatar |
| POST | `/api/avatars/:id/presign` | session | Get presigned R2 upload URL |
| POST | `/api/avatars/:id/pin-ipfs` | session | Pin to IPFS |

**Three-step upload flow:**
```
1. POST /api/avatars/:id/presign  →  { url, storage_key }
2. PUT <presigned_url>            ←  raw GLB bytes
3. POST /api/avatars              →  register metadata with storage_key
```

### Widget API

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/widgets` | session | List your widgets |
| POST | `/api/widgets` | session | Create widget |
| PATCH | `/api/widgets/:id` | session | Update widget |
| DELETE | `/api/widgets/:id` | session | Delete widget |
| POST | `/api/widgets/:id/duplicate` | session | Clone widget |
| GET | `/api/widgets/:id/stats` | — | View stats |
| GET | `/api/widgets/oembed` | — | oEmbed card |

### Memory API

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/agent-memory/:id` | session | Fetch agent memory store |
| POST | `/api/agent-memory/:id` | session | Append memory entries |
| PUT | `/api/agent-memory/:id` | session | Replace memory store |

### Chat & LLM

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/chat` | session \| api-key | Chat with agent (Claude backend) |
| POST | `/api/llm/anthropic` | session | Anthropic API proxy |

### Cron Jobs

Scheduled via `vercel.json`, these run automatically in production:

| Schedule | Endpoint | Purpose |
|---|---|---|
| Every 15 min | `/api/cron/erc8004-crawl` | Index new agents from blockchain |
| Every 5 min | `/api/cron/index-delegations` | Index EIP-7710 delegations |
| Hourly | `/api/cron/run-dca` | Execute DCA strategy orders |
| Hourly | `/api/cron/run-subscriptions` | Execute recurring subscriptions |

---

## Authentication & OAuth 2.1

three.ws supports three authentication methods:

**1. Email + Password (Session cookie)**
```
POST /api/auth/register   →  create account
POST /api/auth/login      →  JWT session cookie
GET  /api/auth/me         →  current user
POST /api/auth/logout     →  revoke session
```

**2. Wallet (SIWE / SIWS)**
```
POST /api/auth/siwe        →  get nonce challenge
POST /api/auth/siwe/verify →  verify EIP-4361 signed message → session
POST /api/auth/siws        →  Solana equivalent
```

**3. Developer API Keys**
```
POST /api/api-keys          →  create key (set scope + expiry)
DELETE /api/api-keys/:id    →  revoke key
Authorization: Bearer sk-...  →  authenticate requests
```

**OAuth 2.1 Server (RFC 6749 + PKCE)**

For third-party apps and MCP integrations:

```
GET  /oauth/authorize                       →  consent screen
POST /oauth/authorize                       →  submit consent → auth code
POST /oauth/token                           →  exchange code for tokens
POST /oauth/register                        →  RFC 7591 dynamic client reg
POST /oauth/revoke                          →  RFC 7009 token revocation
POST /oauth/introspect                      →  RFC 7662 token check
GET  /.well-known/oauth-authorization-server →  RFC 8414 discovery
GET  /.well-known/oauth-protected-resource  →  RFC 9728 resource discovery
```

Token scopes: `avatars:read`, `avatars:write`, `agents:read`, `agents:write`, `mcp`.

Access tokens are short-lived JWTs (1 hour). Refresh tokens are opaque strings stored hashed in Postgres.

---

## MCP Server

`api/mcp.js` (759 lines) implements the [Model Context Protocol](https://modelcontextprotocol.io) 2025-06-18 specification over HTTP with JSON-RPC 2.0. It enables external AI systems (including Claude Desktop, other agents, or custom integrations) to drive avatars programmatically.

**Endpoint:** `POST /api/mcp`
**Auth:** OAuth 2.1 Bearer token with `mcp` scope
**Registry:** Listed on the [official MCP Registry](https://registry.modelcontextprotocol.io/?q=three.ws) as `io.github.nirholas/three.ws`
**x402scan:** [view on x402scan](https://www.x402scan.com/server/17cbd874-52ac-4920-a020-b22ff2489a07) — paid MCP tool calls and revenue

**Available tools:**

| Tool | Description |
|---|---|
| `list_my_avatars` | List all avatars owned by the authenticated user |
| `get_avatar` | Fetch metadata and download URL for a specific avatar |
| `search_public_avatars` | Search the public avatar library by name, tag, or description |
| `render_avatar` | Generate a preview render of an avatar (returns image URL) |
| `delete_avatar` | Permanently delete an avatar |
| `validate_model` | Run Khronos glTF validation and return error report |
| `inspect_model` | Inspect model internals (mesh count, material list, animation names, texture sizes) |
| `optimize_model` | Optimize a model (Draco compression, texture downscale, mesh simplification) |

**MCP discovery:** configured in `.mcp.json` at the repo root for Claude Desktop integration.

**SSE stream:** `GET /api/mcp` returns a Server-Sent Events stream for real-time notifications from long-running operations (validation, optimization).

---

## On-Chain Identity (ERC-8004)

ERC-8004 is a draft standard for verifiable 3D agent identity. The `contracts/` directory contains a full Foundry implementation.

### Contracts

**IdentityRegistry.sol** — the primary contract. Each agent is an ERC-721 token with:
- `agentId` — stable numeric ID (the token ID)
- `owner` — EVM address of the agent's owner
- `delegatedSigner` — optional secondary address for runtime signing (EIP-712 typed signature)
- `tokenURI` — IPFS URL of the agent manifest JSON
- `metadata` — on-chain name, description, image pointer

**ReputationRegistry.sol** — stores signed feedback scores. Each reviewer can submit one score per agent. Scores are averaged for an on-chain reputation metric.

**ValidationRegistry.sol** — records validator attestations for off-chain proofs (glTF validation reports, skill audits, security reviews).

### Deployment Addresses

See `contracts/DEPLOYMENTS.md` for current mainnet and testnet addresses.

### Registration Flow (EVM)

```
1. POST /api/agents/register-prep   →  { manifest, typedData }
   (uploads manifest to IPFS, builds EIP-712 typed data for signing)

2. User signs typedData with their wallet

3. POST /api/agents/register-confirm  →  { txHash, agentId }
   (submits transaction, waits for confirmation, updates agent record)
```

The agent is now an ERC-721 token. Its manifest lives on IPFS. Its action history is anchored to its `agentId`. Any third party can verify the agent's identity, owner, and reputation without trusting three.ws.

### On-Chain Indexing

`api/cron/erc8004-crawl.js` runs every 15 minutes to index new IdentityRegistry mint events. Indexed agents appear in `/discover` and can be imported via `/hydrate`.

### Solana variant — same shape, no deployed program

Solana ships an ERC-8004 analog without any custom on-chain program:

- **Identity** — Metaplex Core NFT minted via `registerSolanaAgent()` (the asset pubkey is the agent ID).
- **Reputation + Validation** — signed SPL Memo transactions referencing the agent asset pubkey, with a JSON envelope (`threews.feedback.v1` / `threews.validation.v1`). Anyone can read every attestation about an agent via `getSignaturesForAddress(assetPubkey)`.

SDK:

```js
import { attestFeedback, attestValidation, listAttestations } from '@nirholas/agent-kit';

await attestFeedback({ agentAsset, score: 5, network: 'devnet' });
await attestValidation({ agentAsset, taskHash: '0x…', passed: true, network: 'devnet' });
const rows = await listAttestations({ agentAsset, kind: 'all', network: 'devnet' });
```

Server read endpoint: `GET /api/agents/solana-attestations?asset=<pubkey>&kind=feedback|validation|all&network=devnet|mainnet`.

Demo page: [sdk/example/solana-attest.html](sdk/example/solana-attest.html).

### Pump.fun signals (Solana off-chain reputation)

Solana agents can ingest live pump.fun activity (GitHub social-fee claims, token graduations) as off-chain trust signals that feed into the agent's Solana reputation score and surface through the Empathy Layer in real time.

| Surface | Path | Purpose |
|---|---|---|
| MCP client | [api/_lib/pumpfun-mcp.js](api/_lib/pumpfun-mcp.js) | Cached JSON-RPC client to upstream `pumpfun-claims-bot` |
| Read API | [api/agents/pumpfun.js](api/agents/pumpfun.js) | `?op=claims\|graduations\|token\|creator` |
| SSE feed | [api/agents/pumpfun-feed.js](api/agents/pumpfun-feed.js) | Live event stream, 90s window, auto-reconnects |
| Cron crawler | [api/cron/pumpfun-signals.js](api/cron/pumpfun-signals.js) | 15-min sweep → `pumpfun_signals` table |
| Skills | [src/agent-skills-pumpfun-watch.js](src/agent-skills-pumpfun-watch.js) | `recent-claims`, `token-intel`, `watch-start`, `watch-stop` |
| Widget | [src/widgets/pumpfun-feed.js](src/widgets/pumpfun-feed.js) | Live cards overlay |
| Reputation | [api/agents/solana-reputation.js](api/agents/solana-reputation.js) | `pumpfun_signals` block in response |
| Passport | [api/agents/solana-card.js](api/agents/solana-card.js) | `pumpfun` block on the agent card |

The crawler runs on a `*/15 * * * *` schedule (see [vercel.json](vercel.json)) and writes into the `pumpfun_signals` table. Agents subscribed via `watch-start` react to incoming events through the existing protocol bus — no new event types required.

Full design and configuration in [docs/solana-pumpfun.md](docs/solana-pumpfun.md).

---

## Pump.fun Integration

Beyond the Solana reputation signals described above, the platform also ships consumer-facing pump.fun tooling:

- **Token Launcher** — UI for creating and launching new tokens, at [public/pumpfun.html](public/pumpfun.html).
- **Live Dashboard** — real-time tracker for new tokens, at [pump-live.html](pump-live.html).
- **Skills** — the [pump-fun-skills/](pump-fun-skills/) directory contains agent skills for reading and acting on pump.fun.

---

## Database Schema

The Postgres schema (`api/_lib/schema.sql`) is fully idempotent — all migrations use `CREATE TABLE IF NOT EXISTS` patterns. Safe to re-run on any environment.

**Core tables:**

```sql
-- Users
users (id, email, password_hash, display_name, avatar_url, plan, wallet_address, deleted_at)

-- 3D model files
avatars (id, owner_id, slug, name, description, storage_key, visibility,
         tags, checksum_sha256, version, deleted_at)

-- Sessions
sessions (id, user_id, token_hash, user_agent, ip, expires_at, revoked_at)

-- Developer API keys
api_keys (id, user_id, prefix, token_hash, scope, expires_at, revoked_at)

-- Agent identities
agent_identities (id, user_id, name, description, avatar_id, skills,
                  meta, wallet_address, erc8004_agent_id, deleted_at)

-- Signed action log
agent_actions (id, agent_id, type, payload, source_skill,
               signature, signer_address, created_at)

-- Memory store
agent_memories (id, agent_id, type, content, tags, context,
                salience, expires_at, created_at)
```

**OAuth tables:**

```sql
oauth_clients       (client_id, client_secret_hash, redirect_uris, grant_types, scope, ...)
oauth_auth_codes    (code, client_id, user_id, code_challenge, expires_at, consumed_at)
oauth_refresh_tokens(token_hash, client_id, user_id, scope, expires_at, revoked_at, ...)
```

**Wallet & signing:**

```sql
user_wallets  (user_id, address, chain_type, chain_id, is_primary)
siwe_nonces   (nonce, address, issued_at, expires_at, consumed_at)
siws_nonces   (same shape for Solana)
```

**Usage & quotas:**

```sql
usage_events (user_id, api_key_id, client_id, avatar_id, kind, tool, status, bytes, latency_ms)
plan_quotas  (plan, max_avatars, max_bytes_per_avatar, max_total_bytes)
```

---

## Build & Deployment

### npm Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on port 3000 with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run build:lib` | Build `<agent-3d>` web component library to `dist-lib/` |
| `npm run build:artifact` | Build standalone Claude artifact viewer bundle |
| `npm run build:all` | Chat build, then `build` + `build:lib` + `build:rider` in parallel |
| `npm run publish:lib` | Publish versioned CDN bundles to `/agent-3d/` |
| `npm run test` | Vitest unit suite + Playwright end-to-end suite |
| `npm run test:e2e` | Playwright end-to-end suite only |
| `npm run verify` | Prettier check + Vite build (pre-deploy gate) |
| `npm run format` | Prettier write (entire repo) |
| `npm run deploy` | `build:all` → `check:dist` → `vercel --prod` |
| `npm run clean` | Remove `dist/` and `dist-lib/` |
| `npm run fetch-animations` | Download animation clip assets |
| `npm run generate-icons` | Generate PWA icon set |
| `npm run db:migrate` | Apply Postgres migrations from `scripts/migrations/` |
| `npm run db:status` | Show pending Postgres migrations |
| `npm run seed:skills` | Seed the skills registry from `skills-manifest.js` |
| `npm run install:sdk` | Install + build `agent-payments-sdk` and link it locally |
| `npm run validate:cards` | Validate agent definition cards in `src/agents/` |
| `npm run pump:smoke` | Run the pump.fun lifecycle smoke test |

### Claude CLI

`scripts/claude.sh` (aliased as `npm run claude`) wraps the npm scripts above with confirmation prompts on destructive commands (`deploy`, `db-migrate`). Useful when you want guard-rails or a single entry point for an agent to drive.

```bash
npm run claude -- <command>
# or
./scripts/claude.sh <command>
```

| Command | Wraps |
|---|---|
| `install-sdk` | `npm run install:sdk` |
| `validate-cards` | `npm run validate:cards` |
| `db-migrate` | `npm run db:migrate` (with confirmation) |
| `db-status` | `npm run db:status` |
| `pump-smoke-test` | `npm run pump:smoke` |
| `seed-skills` | `npm run seed:skills` |
| `test` | `npm run test` |
| `format` | `npm run format` |
| `clean` | `npm run clean` |
| `deploy` | `npm run deploy` (with confirmation) |
| `deploy-agent <name>` | Packages an agent into a distributable zip |
| `help` | List all commands |

### Vercel Deployment

The project is built for Vercel. Deployment is one command:

```bash
npm run deploy
```

This runs `build:all` then `vercel --prod`. Routing, rewrites, cache headers, and cron schedules are defined in `vercel.json`.

For preview deployments, push a branch — Vercel auto-deploys it with a preview URL.

**Environment variables** must be set in the Vercel dashboard (not in `.env` files). See [Environment Variables](#environment-variables) for the full list.

### Self-Hosting

For a traditional server deployment:

1. Build: `npm run build` → `dist/`
2. Serve `dist/` as static files (nginx, Caddy, Express)
3. Run `api/` endpoints via Node.js (wrap with Express or use the Vercel dev adapter)
4. Connect to Postgres (Neon or self-hosted)
5. Connect to S3-compatible storage (R2, MinIO, AWS S3)
6. Schedule cron jobs with node-cron or systemd timers

**Minimal nginx config:**
```nginx
server {
    listen 80;
    root /var/www/3d-agent/dist;
    index index.html;

    location /api {
        proxy_pass http://localhost:3001;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Environment Variables

### Required (Backend)

```env
# App
PUBLIC_APP_ORIGIN=https://three.ws           # No trailing slash

# Database
DATABASE_URL=postgres://user:pass@host/db    # Neon or any Postgres 15+

# Object storage (Cloudflare R2 or S3-compatible)
S3_ENDPOINT=https://...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=3d-agent-avatars
S3_PUBLIC_DOMAIN=https://cdn.three.ws        # CDN base URL for public model URLs

# Redis (rate limiting)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Auth
JWT_SECRET=<base64>                          # openssl rand -base64 64
JWT_KID=k1                                   # Key ID (rotate by incrementing)
PASSWORD_ROUNDS=11                           # bcrypt cost factor

# LLM
ANTHROPIC_API_KEY=sk-ant-...
CHAT_MODEL=claude-sonnet-4-6
CHAT_MAX_TOKENS=1024
```

### Optional (Backend)

```env
# Email (required for registration flow)
RESEND_API_KEY=...

# Error monitoring
SENTRY_DSN=...

# Privy (social/embedded wallets)
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...

# Avatar regeneration
AVATURN_API_KEY=...
AVATAR_REGEN_PROVIDER=none                   # none | avaturn

# EIP-7710 permissions relayer
PERMISSIONS_RELAYER_ENABLED=false
AGENT_RELAYER_KEY=0x...
AGENT_RELAYER_ADDRESS=0x...

# Per-chain RPC URLs (add chains as needed)
RPC_URL_84532=https://sepolia.base.org
RPC_URL_8453=https://mainnet.base.org

# IPFS pinning
PINATA_JWT=...
WEB3_STORAGE_TOKEN=...                       # Fallback
```

### Optional (Frontend, prefixed `VITE_`)

```env
VITE_CHARACTER_STUDIO_URL=https://studio.three.ws  # Avatar builder iframe origin
VITE_PRIVY_APP_ID=...
VITE_AVATURN_EDITOR_URL=https://editor.avaturn.me/
VITE_AVATURN_DEVELOPER_ID=...
```

---

## Testing

The test suite uses Vitest. API tests mock the database and auth layer; frontend tests mock the viewer.

```bash
npm run test                           # All tests
npm run test -- tests/api/agents       # Specific file
npm run verify                         # prettier check + vite build
```

**Test coverage:**

| Area | Files |
|---|---|
| Agent CRUD | `tests/api/agents.test.js` |
| Widget CRUD | `tests/api/widgets.test.js` |
| OAuth flow | `tests/api/oauth-authorize.test.js`, `oauth-token.test.js` |
| SIWE wallet auth | `tests/api/siwe.test.js` |
| LLM proxy | `tests/api/llm-anthropic.test.js` |
| Schema validation | `tests/api/validate.test.js` |
| API keys | `tests/api/api-keys.test.js` |
| Crypto utilities | `tests/api/crypto.test.js` |
| Embed CORS policy | `tests/api/embed-policy.test.js` |
| Animation slots | `tests/src/animation-slots.test.js` |
| Widget types | `tests/src/widget-types.test.js` |

Smart contract tests are in `contracts/test/` and run via Foundry:
```bash
cd contracts && forge test
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

**Quick rules:**
- Match existing style — no reformatting adjacent code
- Every changed line should trace to the task
- Add tests for new API endpoints
- Run `npm run verify` before opening a PR (Prettier + build check)
- Keep PRs focused — one concern per PR

**Branch conventions:**
- `feat/...` — new features
- `fix/...` — bug fixes
- `refactor/...` — structural changes without behavior changes
- `docs/...` — documentation only

**Development tips:**
- The viewer runs standalone at `/app` — no auth, no backend required
- Use `mode=view` in the `<agent-3d>` element to test rendering without a brain
- Set `CHAT_MODEL=claude-haiku-4-5-20251001` locally to keep API costs low during development
- The MCP server can be tested with `curl` — it's plain JSON-RPC over HTTP

---

## Contributors

Thanks to everyone who has contributed to this project.

- [@humanoidrobot-glitch](https://github.com/humanoidrobot-glitch) — thank you for your contributions!

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

The three.js library (`node_modules/three`) is MIT licensed. The gltf-validator (`node_modules/gltf-validator`) is Apache 2.0. See each dependency's license for details.

---

*Built with [three.js](https://threejs.org), [Claude](https://claude.ai), and a belief that AI deserves a body.*
