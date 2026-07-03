# Repository Structure

three.ws ships all platform surfaces from a **single npm-workspaces monorepo**.
This file maps each product surface to where it lives in this repository, so
external developers can find what they need without reading 50 top-level
directories.

When an internal surface gains an external consumer that needs an independent
release cadence, we promote it to its own published package (and optionally its
own repo via `git subtree split`). See [Promotion path](#promotion-path) at the
bottom.

## three.ws surface map

| Surface | Location | Status | Notes |
|---|---|---|---|
| Web renderer / viewer | [avatar-sdk/](avatar-sdk) `→ /viewer` | Published as `@three-ws/avatar` | `<agent-3d>` web component |
| Walk companion + playground | [walk-sdk/](walk-sdk) `→ /walk-companion.js` | Published as `@three-ws/walk` | Corner mascot + full-page stroll/platformer playground + diverse avatar picker. App entries: [src/walk-companion.js](src/walk-companion.js), [src/walk-playground.js](src/walk-playground.js) |
| React avatar creator | [avatar-sdk/](avatar-sdk) `→ /react` `/creator` | Published as `@three-ws/avatar` | Same package, React subpath |
| Talking page guide | [page-agent-sdk/](page-agent-sdk) | Published as `@three-ws/page-agent` | Drop-in rigged 3D agent that narrates any page + visitor avatar picker. `<page-agent>` web component. Rigged-only catalog. See [page-agent-sdk/PUBLISHING.md](page-agent-sdk/PUBLISHING.md) |
| Avatar builder (full app) | [character-studio/](character-studio) | Fork of [m3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio), MIT, see [character-studio/LICENSE](character-studio/LICENSE) | Web-first character creator |
| Scene Studio (3D scene editor) | [src/scene-studio/](src/scene-studio) `→ /scene` | Vendored [mrdoob/three.js](https://github.com/mrdoob/three.js) r184 editor, MIT, see [src/scene-studio/vendor/README.md](src/scene-studio/vendor/README.md) | Import GLBs, compose scenes, edit materials/lights, export |
| Diorama (text → 3D world) | [src/diorama/](src/diorama) `→ /diorama` | In-repo · backend [api/diorama.js](api/diorama.js) | One sentence → an explorable 3D diorama: Claude composes the scene, each object is forged to a real GLB, assembled live, saved to a public gallery + shareable permalink |
| Labs (hidden-gems hub) | [pages/labs.html](pages/labs.html) + [src/labs.js](src/labs.js) `→ /labs` | In-repo | Data-driven discovery hub: renders every `data/pages.json` entry flagged `showcase: true` as a live card (status check + iframe preview), filterable by category |
| Live Agents wall (mission control) | [pages/agents-live.html](pages/agents-live.html) + [src/agents-live.js](src/agents-live.js) `→ /agents-live` | In-repo · roster [api/agents/public.js](api/agents/public.js) (`sort=live`), per-agent SSE [api/agent-screen-stream.js](api/agent-screen-stream.js) | Real-time grid of every meaningful agent, ranked by most-recent on-chain/skill action (never-used placeholders suppressed). Each card streams a live caster feed when watched, else its real `agent_actions` as a terminal + an "active Nm ago" recency chip. Layers: showrunner spotlight ([src/showrunner.js](src/showrunner.js)), reputation arena ([src/agents-live-arena.js](src/agents-live-arena.js)), platform ticker ([src/theater-feed.js](src/theater-feed.js)) |
| X/Twitter automation toolkit | [xactions/](xactions) | Vendored [nirholas/XActions](https://github.com/nirholas/XActions), MIT, see [xactions/LICENSE](xactions/LICENSE) | Self-contained fork (browser scripts, CLI, MCP server, dashboard). Not an npm workspace — own `package.json`/deploy. Includes the console **Post Scraper** panel at [xactions/public/tools/](xactions/public/tools) |
| Agora — the Commons (living economy) | [pages/agora.html](pages/agora.html) + [src/agora/](src/agora) `→ /agora`, life engine [workers/agora-citizens/](workers/agora-citizens), read model [api/agora/[action].js](api/agora/[action].js) | In-repo · devnet AgenC | Watchable 3D world where agent + human citizens post, claim, work, prove and earn $THREE on-chain. **Play mode** ("Enter the Commons") makes it walkable GTA-style — your avatar walks the square among the working NPC citizens, other humans appear live over the `agora_world` Colyseus room, and walking up to a citizen (proximity → E) opens its passport: [src/agora/player-mode.js](src/agora/player-mode.js), pure math [src/agora/player-logic.js](src/agora/player-logic.js), room [multiplayer/src/rooms/AgoraRoom.js](multiplayer/src/rooms/AgoraRoom.js). **Arena** (Competitive tasks — citizens race, first valid proof wins the whole escrow) at [src/agora/arena.js](src/agora/arena.js); **Guilds** (Collaborative tasks — contributors split the reward) at [src/agora/guild.js](src/agora/guild.js), both live-driven by [api/agora/task](api/agora/[action].js). Spec: [docs/agora.md](docs/agora.md) |
| Embed examples | [examples/](examples) | In-repo | `embed-test.html`, `web-component.html`, `two-agents.html`, `minimal.html` |
| Animation pipeline | [public/animations/](public/animations) + [scripts/build-animations.mjs](scripts/build-animations.mjs) | In-repo | Mixamo source FBX + GLB retargeting pipeline · see [docs/3d-asset-pipeline.md](docs/3d-asset-pipeline.md) |
| FBX → GLB conversion | [scripts/fbx-to-glb.mjs](scripts/fbx-to-glb.mjs) | In-repo | Skinned/animated FBX → GLB (FBX2glTF), `npm run convert:fbx` |
| Avatar schema | [packages/avatar-schema/](packages/avatar-schema) | Published as `@three-ws/avatar-schema` | JSON Schema for on-chain avatar manifests |
| Integration demos | [multiplayer/](multiplayer), [examples/coach-leo/](examples/coach-leo) | In-repo | Multiplayer and VR demos |
| Avatar service backend | [api/](api) + [workers/](workers) | In-repo | Vercel functions + Cloudflare workers |
| On-chain identity | [contracts/](contracts) | In-repo | Foundry-based on-chain agent identity, ERC-8004 |
| On-chain skill licenses | [contracts/skill-license/](contracts/skill-license) `→ /api/skills/license-onchain` | In-repo | Anchor program: each purchased skill = a 1/1 SPL NFT + `SkillLicense` PDA, a trustless alternative to DB-backed access checks. Backend: [api/_lib/skill-license-onchain.js](api/_lib/skill-license-onchain.js) |
| Launch Studio (coin-launch use cases) | [api/_lib/launch/](api/_lib/launch) `→ /launch-studio`, [api/pump/launch-studio.js](api/pump/launch-studio.js), [public/launch-studio/launch-studio.js](public/launch-studio/launch-studio.js) | In-repo | Engine + catalog of 50 declarative launch recipes — reward coins for trending GitHub repos/creators ([github-trending.js](api/_lib/github-trending.js)) and coins riding live narratives ([launcher-trends.js](api/_lib/launcher-trends.js)). Live preview → `/launch` handoff. Docs: [docs/launch-usecases.md](docs/launch-usecases.md), [api/_lib/launch/README.md](api/_lib/launch/README.md) |
| Avatar Seeder control room | [pages/admin/seeder.html](pages/admin/seeder.html) + [src/admin-seeder.js](src/admin-seeder.js) `→ /admin/seeder`, backend [api/admin/seeder.js](api/admin/seeder.js) | In-repo (admin, noindex) | Arm/disarm the headless [Avaturn seed cron](api/cron/avaturn-seed-cron.js), watch live throughput + rig rate, and preview freshly-forged rigged avatars in 3D. Toggles the `avaturn_seed` runtime flag. Flags: [api/_lib/flags.js](api/_lib/flags.js) + [api/admin/flags.js](api/admin/flags.js). Docs: [docs/ops/runtime-flags.md](docs/ops/runtime-flags.md) |
| On-chain agent invocation | [contracts/agent-invocation/](contracts/agent-invocation) | In-repo | Anchor program: verifiable agent-to-agent skill invocation events. SDK: [agent-protocol-sdk/](agent-protocol-sdk) |
| Cross-chain SDKs | [sdk/](sdk), [solana-agent-sdk/](solana-agent-sdk), [agent-payments-sdk/](agent-payments-sdk), [agent-protocol-sdk/](agent-protocol-sdk) | Published | Cross-chain agent SDKs |
| MCP integration | [mcp-server/](mcp-server), [mcp-bridge/](mcp-bridge), [packages/*-mcp/](packages) | 32 npm servers + 6 hosted remote (38 total), all in the [MCP registry](https://registry.modelcontextprotocol.io/?q=io.github.nirholas) | Model Context Protocol surface — full server list in [docs/mcp.md](docs/mcp.md) |
| SNS naming + pay-by-name | [api/sns.js](api/sns.js), [api/sns-subdomain.js](api/sns-subdomain.js), [api/threews/subdomain.js](api/threews/subdomain.js), [api/x402/pay-by-name.js](api/x402/pay-by-name.js), [src/solana/sns-subdomain.js](src/solana/sns-subdomain.js), [pages/threews-claim.html](pages/threews-claim.html) | In-repo | `*.threews.sol` subdomain mint, x402 payments addressed by name. Env: `THREEWS_SOL_PARENT_SECRET_BASE58`. See [SNS_PARTNERSHIP_PROPOSAL.md](docs/internal/SNS_PARTNERSHIP_PROPOSAL.md) |
| Self-hosted x402 facilitator + ring economy | [api/x402-facilitator/[action].js](api/x402-facilitator/[action].js), [api/_lib/x402/self-facilitator.js](api/_lib/x402/self-facilitator.js), [api/x402/ring-settle.js](api/x402/ring-settle.js), [api/_lib/x402/pipelines/ring-rebalance.js](api/_lib/x402/pipelines/ring-rebalance.js), [api/x402-ring.js](api/x402-ring.js), [scripts/x402-ring-setup.mjs](scripts/x402-ring-setup.mjs) | In-repo (off by default) | Closed-loop agent-to-agent x402: platform wallets pay platform endpoints, settled in-house (no external facilitator). Fee-minimized, SOL-floor guarded, internal-labeled. Env: `X402_SELF_FACILITATOR_ENABLED`, `X402_FEE_PAYER_SECRET_BASE58`, `X402_TREASURY_SECRET_BASE58`. See [docs/x402-ring-economy.md](docs/x402-ring-economy.md) |
| Ring economy operator dashboard | [pages/admin/ring.html](pages/admin/ring.html) + [src/admin-ring.js](src/admin-ring.js) `→ /admin/ring`, backend [api/admin/ring-dashboard.js](api/admin/ring-dashboard.js) | In-repo (admin, noindex) | Live eyes on the closed-loop x402 ring: per-minute settlement pulse (green/amber/red heartbeat), loop diagram with live wallet balances + floors, streaming activity feed (agent attribution, Solscan links, skip/fail reasons), fee-burn vs daily budget, integrity (leak scan + reconciliation), per-endpoint coverage. One aggregate read model composes [/api/x402-ring](api/x402-ring.js); admin/Bearer-secret authed. Labels volume as internal dogfooding. See [docs/x402-ring-economy.md](docs/x402-ring-economy.md#watching-it--the-operator-dashboard) |
| Economy funding root (master wallet) | [api/_lib/economy-master.js](api/_lib/economy-master.js), cron [api/cron/treasury-topup.js](api/cron/treasury-topup.js), registry [api/_lib/solana-signers.js](api/_lib/solana-signers.js) | In-repo (inert until keyed) | One master wallet (`WwwuGbq…T3WwW`, `ECONOMY_MASTER_SECRET_BASE58`) auto-tops-up every other Solana engine below its floor. Funder-only — never trades/settles; reserve/per-engine/per-run guarded; allowlisted to registry wallets; fee-minimized. See [docs/economy-master.md](docs/economy-master.md) + [SOLANA-SIGNERS.md](tasks/onchain-deployment/SOLANA-SIGNERS.md) |
| Economy master audit ledger + breach monitor | ledger [api/_lib/economy-ledger.js](api/_lib/economy-ledger.js) ([schema](api/_lib/migrations/20260702010000_economy_master_ledger.sql)), reconcile cron [api/cron/economy-reconcile.js](api/cron/economy-reconcile.js), export [scripts/economy-ledger-export.mjs](scripts/economy-ledger-export.mjs) | In-repo | Tamper-evident (SHA-256 hash-chained) accounting book of every SOL movement from the master, with running balance + USD-at-transfer-time. The reconcile cron checks it every 30 min for tamper, unrecorded on-chain outbound (breach/key-compromise), and on-chain integrity; findings land in `payment_reconciliation`. Accounting CSV/JSON export. See [docs/economy-master.md](docs/economy-master.md#audit-accounting--breach-monitoring) |
| Autonomous trading experiment | policy [scripts/trading-experiment-setup.mjs](scripts/trading-experiment-setup.mjs), laddered exit [workers/agent-sniper/exit-logic.js](workers/agent-sniper/exit-logic.js) (`decideLadderedExit`), no-Mayhem gate [workers/agent-sniper/mayhem-gate.js](workers/agent-sniper/mayhem-gate.js), journal [workers/agent-sniper/journal.js](workers/agent-sniper/journal.js) → [api/sniper/journal.js](api/sniper/journal.js) | In-repo | One agent, ~10 SOL, newer pump.fun launches ($10k–$100k mcap, no Mayhem). Take-initials-at-2× laddered exit keeps a moon bag (never a 100% exit up), hard stop-loss underneath. Every decision journaled with its reasoning. UI-funded, simulate-first. See [docs/trading-experiment.md](docs/trading-experiment.md) |

## npm workspaces

Declared in [package.json](package.json):

```
agent-payments-sdk/           → @three-ws/agent-payments (fork of @pump-fun/agent-payments-sdk@3.0.3)
agent-ui-sdk/                 → @three-ws/agent-ui
avatar-sdk/                   → @three-ws/avatar
character-studio/             → @m3-org/characterstudio (fork)
mcp-bridge/                   → @three-ws/mcp-bridge
mcp-server/                   → @three-ws/mcp-server
multiplayer/                  → @three-ws/multiplayer
packages/avatar-schema/       → @three-ws/avatar-schema
packages/avatar-cli/          → @three-ws/avatar-cli
packages/viewer-presets/      → @three-ws/viewer-presets
packages/avatar-agent-mcp/    → @three-ws/avatar-agent-mcp  (MCP server — avatar agent tools)
packages/pumpfun-mcp/         → @three-ws/pumpfun-mcp       (MCP server — pump.fun launch tools)
packages/ibm-watsonx-mcp/     → @three-ws/ibm-watsonx-mcp   (MCP server — IBM watsonx.ai)
packages/ibm-x402-mcp/        → @three-ws/ibm-x402-mcp      (MCP server — IBM x402 payments)
packages/alibaba-cloud-mcp/   → @three-ws/alibaba-cloud-mcp  (MCP server — Alibaba Cloud DashScope: Qwen chat, embeddings, model discovery)
packages/three-token-mcp/     → @three-ws/three-token-mcp   (MCP server — $THREE token tools)
packages/threews-avatar-mcp/  → @three-ws/threews-avatar-mcp (MCP server — three.ws avatar ops)
packages/scene-mcp/           → @three-ws/scene-mcp         (MCP server — text→3D diorama scenes)
packages/vanity-mcp/          → @three-ws/vanity-mcp        (MCP server — Solana vanity bounty market + rarity gallery)
packages/naming-mcp/          → @three-ws/naming-mcp        (MCP server — .sol resolve + *.threews.sol identity availability)
packages/intel-mcp/           → @three-ws/intel-mcp         (MCP server — smart-money, signals, KOL, copy-trade intel)
packages/marketplace-mcp/     → @three-ws/marketplace-mcp   (MCP server — agent marketplace + skills catalog browse)
packages/x402-mcp/            → @three-ws/x402-mcp          (MCP server — self-custodial x402 buyer: find/inspect/pay any service in USDC)
packages/autopilot-mcp/       → @three-ws/autopilot-mcp     (MCP server — agent execution control: scopes, SOL spend caps, propose/execute/undo)
packages/portfolio-mcp/       → @three-ws/portfolio-mcp     (MCP server — portfolio, PnL, balances, trade feed, signed transfers)
packages/provenance-mcp/      → @three-ws/provenance-mcp    (MCP server — append-only, signed, on-chain-verifiable agent action log)
packages/copy-mcp/            → @three-ws/copy-mcp          (MCP server — manage copy-trade follows, sizing & guard rules)
packages/signals-mcp/         → @three-ws/signals-mcp       (MCP server — discover signal feeds by proven edge; rank publishers)
packages/alerts-mcp/          → @three-ws/alerts-mcp        (MCP server — pump.fun alert rules: in-app, webhook, Telegram)
packages/notifications-mcp/   → @three-ws/notifications-mcp (MCP server — inbox, read state, delivery prefs, Web Push)
packages/billing-mcp/         → @three-ws/billing-mcp       (MCP server — plan quotas, usage, invoices, receipts)
packages/activity-mcp/        → @three-ws/activity-mcp      (MCP server — trending agents/coins, $THREE holder board, activity ticker)
packages/agenc-mcp/           → @three-ws/agenc-mcp         (MCP server — AgenC on-chain task marketplace + agent registry)
packages/agora-mcp/           → @three-ws/agora-mcp         (MCP server — Agora economy: board/pulse/passport reads + register/claim/complete/post writes)
packages/vision-mcp/          → @three-ws/vision-mcp        (MCP server — image understanding via the three.ws vision pipeline)
packages/brain-mcp/           → @three-ws/brain-mcp         (MCP server — multi-provider LLM router)
packages/audio-mcp/           → @three-ws/audio-mcp         (MCP server — TTS, STT, audio-to-face lipsync, motion capture)
packages/kol-mcp/             → @three-ws/kol-mcp           (MCP server — per-wallet KOL portfolio + trade analytics)
packages/clash-mcp/           → @three-ws/clash-mcp         (MCP server — Coin Clash faction battles)
packages/tutor-mcp/           → @three-ws/tutor-mcp         (MCP server — itemized learning-session ledger)
packages/loom-mcp/            → @three-ws/loom-mcp          (MCP server — Loom 3D-creation gallery: browse, fetch, submit)
packages/agent-sniper/        → @three-ws/agent-sniper      (engine + CLI + MCP server + x402 paid API — autonomous, self-custodial pump.fun sniper)
walk-sdk/                     → @three-ws/walk             (page walking companion + playground + avatar picker)
```

`packages/*` is the home for clean, publishable spec/schema/preset packages
with no runtime dependency on the main app.

Cross-chain SDKs that ship on their own (`sdk/` → `@three-ws/sdk`,
`solana-agent-sdk/` → `@three-ws/solana-agent`,
`agent-protocol-sdk/` → `@three-ws/agent-protocol-sdk`) live at the top level
but are **not** npm workspaces.

`packages/` is reserved for spec/schema/protocol packages with no runtime
dependencies on the main app — things that need to be installable by external
consumers (e.g. another team building an avatar viewer that wants to validate
our manifest format).

Runtime SDKs and apps live at the top level for historical compatibility with
the deploy pipeline and existing import paths.

## SDK packages (published)

These wrap already-live platform capabilities (real `api/` endpoints + MCP
tools) into single-import `@three-ws/*` SDKs. Each is a **zero-dependency,
pure-ESM** client: it ships `src/` directly (no build step), hand-written
`.d.ts` types, and a `node --test` suite — all green (216 tests across the
suite). They share one byte-identical HTTP core (`src/http.js`: base-URL
resolution + typed `ThreeWsError`/`PaymentRequiredError`, with 402 carrying the
x402 challenge). Verify any of them with `cd packages/<name> && node --test
test/*.test.js`.

Launch state: **published to npm** as `@three-ws/<name>` — install with
`npm i @three-ws/<name>`. The merchant SDK (`@three-ws/x402-server`) advertises
the two main x402 assets, **USDC and $THREE**, in one 402 challenge. Re-publish
is idempotent via `node scripts/publish-packages.mjs` (skips versions already on
npm); see [docs/sdk-launch.md](docs/sdk-launch.md) for the runbook.

| Package | Location | Wraps | What it does |
|---|---|---|---|
| `@three-ws/forge` | [packages/forge/](packages/forge) | `api/forge*.js`, `api/mcp-3d.js` | Text/image/sketch → textured, rig-ready GLB; free TRELLIS lane + paid tiers + auto-rig |
| `@three-ws/names` | [packages/names/](packages/names) | `api/sns*.js`, `api/x402/pay-by-name.js` | ENS + SNS resolution, `*.threews.sol` minting, pay-by-name |
| `@three-ws/intel` | [packages/intel/](packages/intel) | `api/sentiment.js`, `api/aixbt/`, `pump_snapshot` | Token sentiment, narrative intel, momentum scans, token snapshots |
| `@three-ws/vanity` | [packages/vanity/](packages/vanity) | `api/vanity/`, `src/solana/vanity/` (WASM) | WASM-accelerated Solana vanity address mining |
| `@three-ws/reputation` | [packages/reputation/](packages/reputation) | `api/reputation/`, `api/erc8004/` | ERC-8004 agent reputation read + attest |
| `@three-ws/voice` | [packages/voice/](packages/voice) | `api/asr.js`, `api/tts/`, `api/a2f.js` | ASR + TTS + audio2face lipsync visemes |
| `@three-ws/x402-server` | [packages/x402-server/](packages/x402-server) | `api/x402-merchant.js`, `api/x402-pay.js` | Merchant/seller side of x402 — turn any endpoint paid |
| `@three-ws/agent-memory` | [packages/agent-memory/](packages/agent-memory) | `api/agent-memory.js`, `api/memory/` | Embeddings-backed persistent agent memory + entity graph |
| `@three-ws/agenc` | [packages/agenc/](packages/agenc) | `api/agenc/` | AgenC coordination protocol — task discovery, status, registry |
| `@three-ws/guardian` | [packages/guardian/](packages/guardian) | `api/guardian/`, Granite Guardian | Content safety / moderation for agents |
| `@three-ws/glb-tools` | [packages/glb-tools/](packages/glb-tools) | `_lib/glb-inspect.js`, `glb-themer.js`, `bake.js` | Inspect, re-theme, and bake GLBs from CLI/CI |
| `@three-ws/agent-guards` | [packages/agent-guards/](packages/agent-guards) | `_lib/agent-spend-policy.js`, `agent-trade-guards.js` | Spend + trade guardrails for autonomous agents |
| `@three-ws/skill-license` | [packages/skill-license/](packages/skill-license) | `contracts/skill-license/`, `api/skills/` | On-chain skill licenses (SPL NFT + PDA) mint/verify |
| `@three-ws/mocap` | [packages/mocap/](packages/mocap) | `api/mocap/` | Motion-capture clips → avatar animation |
| `@three-ws/strategies` | [packages/strategies/](packages/strategies) | `api/strategies.js`, `dca-strategies.js`, copy/mirror engines | Automated trading strategies (DCA, copy, mirror) |
| `@three-ws/pumpfun-skills` | [packages/pumpfun-skills/](packages/pumpfun-skills) | [pump-fun-skills/](pump-fun-skills) | pump.fun create-coin / swap / fees skills (runtime mint) |
| `@three-ws/irl` | [packages/irl/](packages/irl) | `api/irl/`, `_lib/geohash.js` | Geofenced real-world presence + nearby discovery |
| `@three-ws/pose` | [packages/pose/](packages/pose) | `get_pose_seed`, `api/mcp-3d.js` | Pose-seed generation for rigged avatars |

## Where things actually live

- **3D viewer & creator** — [avatar-sdk/](avatar-sdk), [character-studio/](character-studio)
- **Avatar / accessory assets** — [public/avatars/](public/avatars), [public/accessories/](public/accessories)
- **Animations** — [public/animations/](public/animations) (Mixamo FBX → built GLB clips), [scripts/build-animations.mjs](scripts/build-animations.mjs)
- **On-chain identity & contracts** — [contracts/](contracts), [packages/avatar-schema/](packages/avatar-schema)
- **API endpoints** — [api/](api) (Vercel functions), [workers/](workers) (Cloudflare workers)
- **Examples & demos** — [examples/](examples), [multiplayer/](multiplayer)
- **Cross-chain SDKs** — [sdk/](sdk), [solana-agent-sdk/](solana-agent-sdk), [agent-payments-sdk/](agent-payments-sdk), [agent-protocol-sdk/](agent-protocol-sdk)
- **MCP integration** — [mcp-server/](mcp-server), [mcp-bridge/](mcp-bridge)
- **Specs & protocol docs** — [specs/](specs)
- **Frontend pages** — [src/](src), [pages/](pages), [public/](public)
- **Tests** — [tests/](tests)

## Promotion path

A surface graduates to its own repo only when there is a concrete external
need that the monorepo cannot serve:

1. **A third party wants to consume it without pulling our whole tree.**
   Mitigation: publish to npm under `@three-ws/*` first. If the npm package
   is enough, no repo split is needed.
2. **Independent release cadence required.** When the surface needs its own
   semver line decoupled from the app.
3. **External contributors blocked.** When the repo size or unrelated CI cost
   is a real friction for outside PRs.

Promotion procedure (when triggered):

```bash
# Cleanly split a directory's full history into a new repo
git subtree split --prefix=packages/avatar-schema -b avatar-schema-split
cd ../  && mkdir avatar-schema-repo && cd avatar-schema-repo
git init && git pull ../three.ws avatar-schema-split
git remote add origin https://github.com/nirholas/avatar-schema.git
git push -u origin main
# Then in three.ws: replace the workspace dir with a normal npm dep
```

Until the trigger fires, splitting is premature: each new repo adds release
overhead, CI cost, and cross-repo PR coordination tax for zero functional
gain.

## See also

- [README.md](README.md) — product overview, quickstart, full feature list
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose changes
- Attribution for derived code and assets — [character-studio/LICENSE](character-studio/LICENSE) (fork of M3-org/CharacterStudio), [src/scene-studio/vendor/LICENSE](src/scene-studio/vendor/LICENSE) (vendored three.js editor), [public/animations/LICENSES.md](public/animations/LICENSES.md), and the per-asset `LICENSES.md` files under [public/club/](public/club)
- [CLAUDE.md](CLAUDE.md) — operating rules for AI agents working in this repo
