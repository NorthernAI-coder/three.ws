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
| Guided site tour | [tour-sdk/](tour-sdk) | Published as `@three-ws/tour` | 3D guide walks a live site, spotlights sections, narrates each. One-tag CDN build + free roam |
| Tour Builder (no-code playground) | [pages/tour-builder.html](pages/tour-builder.html) `→ /tour-builder` | Live | Point-and-click editor over a demo storefront: pick avatar, add stops, preview the real tour, export curriculum + Shopify snippets. Logic: [public/tour-builder/builder.js](public/tour-builder/builder.js) |
| Avatar builder (full app) | [character-studio/](character-studio) | Fork of [m3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio), MIT, see [character-studio/LICENSE](character-studio/LICENSE) | Web-first character creator |
| Scene Studio (3D scene editor) | [src/scene-studio/](src/scene-studio) `→ /scene` | Vendored [mrdoob/three.js](https://github.com/mrdoob/three.js) r184 editor, MIT, see [src/scene-studio/vendor/README.md](src/scene-studio/vendor/README.md) | Import GLBs, compose scenes, edit materials/lights, export |
| Diorama (text → 3D world) | [src/diorama/](src/diorama) `→ /diorama` | In-repo · backend [api/diorama.js](api/diorama.js) | One sentence → an explorable 3D diorama: Claude composes the scene, each object is forged to a real GLB, assembled live, saved to a public gallery + shareable permalink |
| Labs (hidden-gems hub) | [pages/labs.html](pages/labs.html) + [src/labs.js](src/labs.js) `→ /labs` | In-repo | Data-driven discovery hub: renders every `data/pages.json` entry flagged `showcase: true` as a live card (status check + iframe preview), filterable by category |
| OKX.AI marketplace services | [api/okx/3d/[service].js](api/okx/3d/%5Bservice%5D.js) `→ /api/okx/3d/*` | Live | 3D services sold to other agents on OKX.AI (agent #2632): Agent Identity Studio flagship + decomposed studio services. Catalog source of truth: [api/_lib/okx-catalog.js](api/_lib/okx-catalog.js); pipeline: [api/_okx3d/](api/_okx3d); showcase: [pages/agent-identities.html](pages/agent-identities.html) `→ /agent-identities`; docs: [docs/okx-marketplace.md](docs/okx-marketplace.md) |
| Crypto Data API docs / landing | [pages/crypto.html](pages/crypto.html) `→ /crypto` | In-repo · docs surface | Screenshot-worthy public docs + funnel-top for the free, keyless Crypto Data API (`/api/crypto/*` — token snapshot, security, holders, launches, bonding, whales, symbol, wallet, trending). Renders hero, endpoint table, tabbed quickstart (curl/JS/Python), per-endpoint request/response reference and a live "Try it" console. Probes production at runtime and marks each endpoint Live vs Coming soon (degrades gracefully while sibling endpoints roll out). CTAs funnel to paid uniques: [/launcher](pages/launcher.html), [/vanity-wallet](public/vanity-wallet.html), [/forge](pages/forge.html). Spec: [prompts/x402-overhaul/](prompts/x402-overhaul) |
| Free Crypto Data API + discovery | [api/crypto/index.js](api/crypto/index.js) `→ /api/crypto`, [api/crypto/openapi.js](api/crypto/openapi.js) `→ /api/crypto/openapi.json`, docs [docs/crypto-api.md](docs/crypto-api.md) `→ /docs/crypto-api` | Live · docs surface | Front door + OpenAPI 3.1 for the free, keyless Crypto Data API. Catalog assembler [api/_lib/crypto-catalog/index.js](api/_lib/crypto-catalog/index.js) merges `api/_lib/crypto-catalog/*.js` self-describing descriptors (currently `bonding`, `launches`, `symbol`, `token`, `trending`, `wallet`, `whales`) via a static import barrel — the production source of truth, since Vercel's bundler only ships what static imports reach — plus an additive dev-time directory glob; skips malformed/throwing entries, never throws, valid-empty when zero. New descriptor = drop the file AND add its import line to the barrel. OpenAPI built from the same catalog via [api/_lib/crypto-catalog/openapi.js](api/_lib/crypto-catalog/openapi.js). Index does HTML/JSON content negotiation. Endpoint handlers live in `api/crypto/*.js`. Spec: [prompts/x402-overhaul/](prompts/x402-overhaul) |
| Free 3D API + docs | [api/3d/index.js](api/3d/index.js) `→ /api/3d`, [api/3d/openapi.js](api/3d/openapi.js) `→ /api/3d/openapi.json`, docs [public/3d.html](public/3d.html) `→ /3d` (alias `/docs/3d-api`) | Live · docs surface | Front door + OpenAPI 3.1 for the free, keyless 3D API. Catalog assembler [api/_lib/3d-catalog/index.js](api/_lib/3d-catalog/index.js) merges `api/_lib/3d-catalog/*.js` descriptors (currently `generate`, `inspect`) via a static import barrel (production source of truth) plus an additive dev-time directory glob; new descriptor = drop the file AND add its barrel import line; skips malformed, never throws; OpenAPI built from the same catalog via [api/_lib/3d-catalog/openapi.js](api/_lib/3d-catalog/openapi.js). Index does HTML/JSON content negotiation and advertises the paid ladder (Forge Pro, Rigged Avatars). Docs page: hero, live endpoint table, runnable quickstart with a live "Run inspect" console, embedded `<model-viewer>` GLB preview, and the free→paid ladder. Free endpoints: [api/3d/generate.js](api/3d/generate.js) (prompt 12), [api/3d/inspect.js](api/3d/inspect.js) (prompt 13). GPT Store Actions surface: [api/3d/studio.js](api/3d/studio.js) `→ /api/3d/studio` — a store-compliant twin of `generate` that strips the x402/upgrade block, drops internal ids, and runs the [api/_mcp-studio/safety.js](api/_mcp-studio/safety.js) age-13+ content gate before any GPU work; backs the "three.ws 3D Studio" custom GPT ([prompts/store-submissions/_generated/openai-actions.yaml](prompts/store-submissions/_generated/openai-actions.yaml) + [openai-gpt-config.md](prompts/store-submissions/_generated/openai-gpt-config.md), store-submission prompt 12). Spec: [prompts/x402-overhaul/](prompts/x402-overhaul) |
| Unified service catalog (one source, two storefronts) | [api/_lib/service-catalog/index.js](api/_lib/service-catalog/index.js), descriptors [api/_lib/service-catalog/services/](api/_lib/service-catalog/services/index.js) | Live | The canonical written-once record of every service (paid x402 + free crypto/3D bundles + OKX.AI rows). `toBazaarDiscovery()` generates every static `/api/x402/*` entry in the [api/wk.js](api/wk.js) discovery doc (replacing ~1,400 lines of hand-mirrored blocks); `toOkxCatalog()` reproduces the OKX `catalogIndex()` payload exactly, with an `include:'all'` projection ready for listing expansion. New paid service = drop `services/<slug>.js` + add its barrel import row. No-drift guards: [tests/service-catalog.test.js](tests/service-catalog.test.js). Spec: [specs/SERVICE_CATALOG.md](specs/SERVICE_CATALOG.md) |
| Conversational refinement + remix economy | Iterate: [api/_mcp-studio/tools.js](api/_mcp-studio/tools.js) `refine_model` (free, on `/api/mcp-studio`) + [mcp-server/src/tools/refine-model.js](mcp-server/src/tools/refine-model.js) (paid stdio, $0.25); shared lineage core [mcp-server/src/tools/_lineage.js](mcp-server/src/tools/_lineage.js). Remix (paid track): feed [api/remix-feed.js](api/remix-feed.js) `→ /api/remix-feed` (free browse/publish/lineage), settlement [api/x402/remix-asset.js](api/x402/remix-asset.js) `→ /api/x402/remix-asset` + core [api/_lib/remix-settlement.js](api/_lib/remix-settlement.js) + split math [api/_lib/remix-royalty.js](api/_lib/remix-royalty.js). Docs [docs/remix.md](docs/remix.md), [docs/mcp-studio.md](docs/mcp-studio.md). | Live | Talk to a model to iterate it ("make it metallic") — real anchored re-generation with a revertable/branchable version lineage rendered as a viewer version strip; free on both the OpenAI 3D Studio and the paid MCP server. Creators publish a finished model as remixable (provenance + license + royalty on the existing `forge_creations` rows — no parallel store); another agent pays $0.25 USDC to remix it and a creator-set royalty (≤20%, capped) routes on-chain to the original creator via the audited `transferSolanaUSDC` rail. Split/caps/payout unit-tested ([tests/remix-settlement.test.js](tests/remix-settlement.test.js), [tests/remix-royalty.test.js](tests/remix-royalty.test.js), [tests/refine-lineage.test.js](tests/refine-lineage.test.js)). Free track stays crypto-free. Prompt 09. |
| Embodiment — a living agent body in the chat | Hosted embed [pages/embodiment/embed.html](pages/embodiment/embed.html) `→ /embodiment/embed` (Vite input + vercel route, `frame-ancestors *`); engine [apps-sdk/embodiment/embodiment-stage.js](apps-sdk/embodiment/embodiment-stage.js) (`EmbodimentStage`) + [overlay.js](apps-sdk/embodiment/overlay.js); persona tools (free) [api/_mcp-studio/persona-tools.js](api/_mcp-studio/persona-tools.js) → `/api/mcp-studio` (`create_agent_persona`, `get_agent_persona`, `persona_say`) and (paid) [api/_mcp3d/tools/studio.js](api/_mcp3d/tools/studio.js); shared inline-body artifact [api/_lib/embodiment-artifact.js](api/_lib/embodiment-artifact.js); identity store [api/_lib/persona-store.js](api/_lib/persona-store.js) (Postgres `agent_personas` + fs fallback + durable R2 GLB); reload route [api/mcp3d/persona.js](api/mcp3d/persona.js) `→ /api/mcp3d/persona`. Emotion/rig/lip-sync cores under [src/embodiment/](src/embodiment) + [src/voice/](src/voice). | Live | A generated avatar becomes a persistent, named body that renders inline in ChatGPT/Claude: it lip-syncs each reply, blends the matching expression + gesture, idles between turns, and reloads by `persona_id` in a fresh session (the id is the capability — no sign-in). Rides the universal canonicalize/retarget clip library; a rig without face morphs animates the jaw, a non-humanoid GLB falls back to a gentle idle (`decideRigMode`/`supportsCanonicalClips`) — never a bind-pose T-pose. Zero crypto/token surface. Tests: [tests/persona-store.test.js](tests/persona-store.test.js), [tests/api/persona-resolve-route.test.js](tests/api/persona-resolve-route.test.js), [tests/mcp-studio.test.js](tests/mcp-studio.test.js), [tests/embodiment-rig-mode.test.js](tests/embodiment-rig-mode.test.js). Evidence: [prompts/store-submissions/_generated/embodiment/](prompts/store-submissions/_generated/embodiment/). Store-submission prompt 07. |
| Sperax partnership + SperaxOS plugin | [pages/sperax.html](pages/sperax.html) `→ /sperax`, plugin [public/sperax/](public/sperax/README.md), manifest `→ /.well-known/sperax-plugin.json`, tools [api/chat-plugin/[tool].js](api/chat-plugin/%5Btool%5D.js) `→ /api/chat-plugin/*`, panel `→ /sperax/iframe/` | In-repo · Live | Partnership landing for the SperaxOS integration: three.ws ships as a standalone `plugin.delivery` plugin that gives a SperaxOS agent an embodied 3D avatar (speak/gesture/emote/render_agent), bound to an ERC-8004 identity, settling over Base x402. Launch offer: free AI credits for three.ws users on [chat.sperax.io](https://chat.sperax.io) — page explains what it is and how to claim. Blog: [/blog/three-ws-speraxusd-integration](blog/three-ws-speraxusd-integration.html) |
| Live Agents wall (mission control) | [pages/agents-live.html](pages/agents-live.html) + [src/agents-live.js](src/agents-live.js) `→ /agents-live` | In-repo · roster [api/agents/public.js](api/agents/public.js) (`sort=live`), per-agent SSE [api/agent-screen-stream.js](api/agent-screen-stream.js) | Real-time grid of every meaningful agent, ranked by most-recent on-chain/skill action (never-used placeholders suppressed). Each card streams a live caster feed when watched, else its real `agent_actions` as a terminal + an "active Nm ago" recency chip. Layers: showrunner spotlight ([src/showrunner.js](src/showrunner.js)), reputation arena ([src/agents-live-arena.js](src/agents-live-arena.js)), platform ticker ([src/theater-feed.js](src/theater-feed.js)) |
| X/Twitter automation toolkit | [nirholas/XActions](https://github.com/nirholas/XActions) (external repo, also on npm as `xactions`) | External | Formerly vendored in-repo; removed 2026-07-03 — install from npm or use the upstream repo |
| Agora — the Commons (living economy) | [pages/agora.html](pages/agora.html) + [src/agora/](src/agora) `→ /agora`, life engine [workers/agora-citizens/](workers/agora-citizens), read model [api/agora/[action].js](api/agora/[action].js) | In-repo · devnet AgenC | Watchable 3D world where agent + human citizens post, claim, work, prove and earn $THREE on-chain. **Play mode** ("Enter the Commons") makes it walkable GTA-style — your avatar walks the square among the working NPC citizens, other humans appear live over the `agora_world` Colyseus room, and walking up to a citizen (proximity → E) opens its passport: [src/agora/player-mode.js](src/agora/player-mode.js), pure math [src/agora/player-logic.js](src/agora/player-logic.js), room [multiplayer/src/rooms/AgoraRoom.js](multiplayer/src/rooms/AgoraRoom.js). **Arena** (Competitive tasks — citizens race, first valid proof wins the whole escrow) at [src/agora/arena.js](src/agora/arena.js); **Guilds** (Collaborative tasks — contributors split the reward) at [src/agora/guild.js](src/agora/guild.js), both live-driven by [api/agora/task](api/agora/[action].js). Spec: [docs/agora.md](docs/agora.md) |
| Premium vanity inventory (sell pre-ground addresses) | [public/vanity/premium/](public/vanity/premium/index.html) `→ /vanity/premium`, batch grinder [workers/vanity-grinder/](workers/vanity-grinder), store [api/_lib/vanity-inventory-store.js](api/_lib/vanity-inventory-store.js), sell [api/x402/vanity-premium.js](api/x402/vanity-premium.js) | In-repo · GCP spot CPU | Long (4–5+ char) brandable Solana addresses ground ahead of time on cheap spot CPU, sealed at rest (AES-256-GCM or GCP-KMS envelope, [api/_lib/vanity-vault.js](api/_lib/vanity-vault.js)), and sold from stock via x402 — priced by rarity ($1–$50), delivered exactly once, ciphertext destroyed on delivery. Free `vanity_premium` MCP browse tool. Runbook: [docs/gcp-credits.md](docs/gcp-credits.md) |
| Embed examples | [examples/](examples) | In-repo | `embed-test.html`, `web-component.html`, `two-agents.html`, `minimal.html` |
| Animation pipeline | [public/animations/](public/animations) + [scripts/build-animations.mjs](scripts/build-animations.mjs) | In-repo | Mixamo source FBX + GLB retargeting pipeline · see [docs/3d-asset-pipeline.md](docs/3d-asset-pipeline.md) |
| Animation gallery | [pages/animations.html](pages/animations.html) + [src/animations-gallery.js](src/animations-gallery.js) | Live at `/animations` | 2,100+ clips with poster thumbnails ([scripts/build-animation-thumbnails.mjs](scripts/build-animation-thumbnails.mjs)), derived categories ([src/animation-categories.js](src/animation-categories.js)), shared live-preview engine ([src/animations-live-preview.js](src/animations-live-preview.js)) · see [docs/animations.md](docs/animations.md) |
| FBX → GLB conversion | [scripts/fbx-to-glb.mjs](scripts/fbx-to-glb.mjs) | In-repo | Skinned/animated FBX → GLB (FBX2glTF), `npm run convert:fbx` |
| Avatar schema | [packages/avatar-schema/](packages/avatar-schema) | Published as `@three-ws/avatar-schema` | JSON Schema for on-chain avatar manifests |
| Integration demos | [multiplayer/](multiplayer), [examples/coach-leo/](examples/coach-leo) | In-repo | Multiplayer and VR demos |
| Avatar service backend | [api/](api) + [workers/](workers) | In-repo | Serverless-style handlers + Cloudflare workers |
| Production server (Google Cloud Run) | [server/](server) + [Dockerfile](Dockerfile) | Live | Single Express container serving the static frontend, the vercel.json route table, and all `api/**` handlers with Vercel-parity routing; deploy via `npm run deploy:gcp` ([server/cloudbuild.yaml](server/cloudbuild.yaml)), crons via [scripts/create-gcp-scheduler.mjs](scripts/create-gcp-scheduler.mjs) · see [server/README.md](server/README.md) |
| On-chain identity | [contracts/](contracts) | In-repo | Foundry-based on-chain agent identity, ERC-8004 |
| On-chain skill licenses | [contracts/skill-license/](contracts/skill-license) `→ /api/skills/license-onchain` | In-repo | Anchor program: each purchased skill = a 1/1 SPL NFT + `SkillLicense` PDA, a trustless alternative to DB-backed access checks. Backend: [api/_lib/skill-license-onchain.js](api/_lib/skill-license-onchain.js) |
| Tokenized 3D (mint an avatar as an NFT) | [api/_lib/tokenize-3d.js](api/_lib/tokenize-3d.js) + [api/_lib/tokenize-3d-metadata.js](api/_lib/tokenize-3d-metadata.js), MCP tools [api/_mcp/tools/tokenize.js](api/_mcp/tools/tokenize.js) (`mint_3d_asset`, `get_3d_asset_onchain`) | In-repo | Mint a generated/owned GLB as a Metaplex Core NFT whose media is a live 3D viewer (GLB under `animation_url`), with baked provenance + enforced capped royalties (10%), idempotent, devnet-default. Launch record: [tokenized_3d_assets](api/_lib/migrations/20260707120000_tokenized_3d_assets.sql). Docs: [docs/mcp.md](docs/mcp.md#mint_3d_asset). E2E: [scripts/tokenize-3d-devnet-e2e.mjs](scripts/tokenize-3d-devnet-e2e.mjs) |
| Launch Studio (coin-launch use cases) | [api/_lib/launch/](api/_lib/launch) `→ /launch-studio`, [api/pump/launch-studio.js](api/pump/launch-studio.js), [public/launch-studio/launch-studio.js](public/launch-studio/launch-studio.js) | In-repo | Engine + catalog of 50 declarative launch recipes — reward coins for trending GitHub repos/creators ([github-trending.js](api/_lib/github-trending.js)) and coins riding live narratives ([launcher-trends.js](api/_lib/launcher-trends.js)). Live preview → `/launch` handoff. Docs: [docs/launch-usecases.md](docs/launch-usecases.md), [api/_lib/launch/README.md](api/_lib/launch/README.md) |
| Avatar Seeder control room | [pages/admin/seeder.html](pages/admin/seeder.html) + [src/admin-seeder.js](src/admin-seeder.js) `→ /admin/seeder`, backend [api/admin/seeder.js](api/admin/seeder.js) | In-repo (admin, noindex) | Arm/disarm the headless [Avaturn seed cron](api/cron/avaturn-seed-cron.js), watch live throughput + rig rate, and preview freshly-forged rigged avatars in 3D. Toggles the `avaturn_seed` runtime flag. Flags: [api/_lib/flags.js](api/_lib/flags.js) + [api/admin/flags.js](api/admin/flags.js). Docs: [docs/ops/runtime-flags.md](docs/ops/runtime-flags.md) |
| On-chain agent invocation | [contracts/agent-invocation/](contracts/agent-invocation) | In-repo | Anchor program: verifiable agent-to-agent skill invocation events. SDK: [agent-protocol-sdk/](agent-protocol-sdk) |
| Cross-chain SDKs | [sdk/](sdk), [solana-agent-sdk/](solana-agent-sdk), [agent-payments-sdk/](agent-payments-sdk), [agent-protocol-sdk/](agent-protocol-sdk) | Published | Cross-chain agent SDKs |
| MCP integration | [mcp-server/](mcp-server), [mcp-bridge/](mcp-bridge), [packages/*-mcp/](packages) | 32 npm servers + 6 hosted remote (38 total), all in the [MCP registry](https://registry.modelcontextprotocol.io/?q=io.github.nirholas) | Model Context Protocol surface — full server list in [docs/mcp.md](docs/mcp.md) |
| Agent Skills pack | [.agents/skills/](.agents/skills) → manifest [.agents/skills/SKILLS.md](.agents/skills/SKILLS.md), [.agents/skills/skills-pack.json](.agents/skills/skills-pack.json) | In-repo; bundled in the `three-ws-core` [plugin](.claude-plugin/marketplace.json) | 40 portable `SKILL.md` folders (Agent Skills open standard) for any Claude surface — 3d/creative (cross-platform-safe), wallet/payments, intel/trading. Regenerate manifest: `node scripts/build-skills-pack.mjs`. Docs: [docs/agent-skills.md](docs/agent-skills.md) |
| SNS naming + pay-by-name | [api/sns.js](api/sns.js), [api/sns-subdomain.js](api/sns-subdomain.js), [api/threews/subdomain.js](api/threews/subdomain.js), [api/x402/pay-by-name.js](api/x402/pay-by-name.js), [src/solana/sns-subdomain.js](src/solana/sns-subdomain.js), [pages/threews-claim.html](pages/threews-claim.html) | In-repo | `*.threews.sol` subdomain mint, x402 payments addressed by name. Env: `THREEWS_SOL_PARENT_SECRET_BASE58` |
| Self-hosted x402 facilitator + ring economy | [api/x402-facilitator/[action].js](api/x402-facilitator/[action].js), [api/_lib/x402/self-facilitator.js](api/_lib/x402/self-facilitator.js), [api/x402/ring-settle.js](api/x402/ring-settle.js), [api/_lib/x402/pipelines/ring-rebalance.js](api/_lib/x402/pipelines/ring-rebalance.js), [api/x402-ring.js](api/x402-ring.js), [scripts/x402-ring-setup.mjs](scripts/x402-ring-setup.mjs) | In-repo (off by default) | Closed-loop agent-to-agent x402: platform wallets pay platform endpoints, settled in-house (no external facilitator). Fee-minimized, SOL-floor guarded, internal-labeled. Env: `X402_SELF_FACILITATOR_ENABLED`, `X402_FEE_PAYER_SECRET_BASE58`, `X402_TREASURY_SECRET_BASE58`. See [docs/x402-ring-economy.md](docs/x402-ring-economy.md) |
| Ring economy operator dashboard | [pages/admin/ring.html](pages/admin/ring.html) + [src/admin-ring.js](src/admin-ring.js) `→ /admin/ring`, backend [api/admin/ring-dashboard.js](api/admin/ring-dashboard.js) | In-repo (admin, noindex) | Live eyes on the closed-loop x402 ring: per-minute settlement pulse (green/amber/red heartbeat), loop diagram with live wallet balances + floors, streaming activity feed (agent attribution, Solscan links, skip/fail reasons), fee-burn vs daily budget, integrity (leak scan + reconciliation), per-endpoint coverage. One aggregate read model composes [/api/x402-ring](api/x402-ring.js); admin/Bearer-secret authed. Labels volume as internal dogfooding. See [docs/x402-ring-economy.md](docs/x402-ring-economy.md#watching-it--the-operator-dashboard) |
| Economy funding root (master wallet) | [api/_lib/economy-master.js](api/_lib/economy-master.js), cron [api/cron/treasury-topup.js](api/cron/treasury-topup.js), registry [api/_lib/solana-signers.js](api/_lib/solana-signers.js) | In-repo (inert until keyed) | One master wallet (`WwwuGbq…T3WwW`, `ECONOMY_MASTER_SECRET_BASE58`) auto-tops-up every other Solana engine below its floor. Funder-only — never trades/settles; reserve/per-engine/per-run guarded; allowlisted to registry wallets; fee-minimized. See [docs/economy-master.md](docs/economy-master.md) + the signer registry [api/_lib/solana-signers.js](api/_lib/solana-signers.js) |
| Economy master audit ledger + breach monitor | ledger [api/_lib/economy-ledger.js](api/_lib/economy-ledger.js) ([schema](api/_lib/migrations/20260702010000_economy_master_ledger.sql)), reconcile cron [api/cron/economy-reconcile.js](api/cron/economy-reconcile.js), export [scripts/economy-ledger-export.mjs](scripts/economy-ledger-export.mjs) | In-repo | Tamper-evident (SHA-256 hash-chained) accounting book of every SOL movement from the master, with running balance + USD-at-transfer-time. The reconcile cron checks it every 30 min for tamper, unrecorded on-chain outbound (breach/key-compromise), and on-chain integrity; findings land in `payment_reconciliation`. Accounting CSV/JSON export. See [docs/economy-master.md](docs/economy-master.md#audit-accounting--breach-monitoring) |
| Autonomous trading experiment | policy [scripts/trading-experiment-setup.mjs](scripts/trading-experiment-setup.mjs), laddered exit [workers/agent-sniper/exit-logic.js](workers/agent-sniper/exit-logic.js) (`decideLadderedExit`), no-Mayhem gate [workers/agent-sniper/mayhem-gate.js](workers/agent-sniper/mayhem-gate.js), journal [workers/agent-sniper/journal.js](workers/agent-sniper/journal.js) → [api/sniper/journal.js](api/sniper/journal.js) | In-repo | One agent, ~10 SOL, newer pump.fun launches ($10k–$100k mcap, no Mayhem). Take-initials-at-2× laddered exit keeps a moon bag (never a 100% exit up), hard stop-loss underneath. Every decision journaled with its reasoning. UI-funded, simulate-first. See [docs/trading-experiment.md](docs/trading-experiment.md) |
| Trading Copilot (conversational) | client [src/agent-copilot.js](src/agent-copilot.js), hub tab [src/agent-wallet-hub/tabs/copilot.js](src/agent-wallet-hub/tabs/copilot.js), server [api/agents/copilot.js](api/agents/copilot.js) `→ POST /api/agents/:id/copilot` (SSE) | In-repo | Owner-only chat over an agent's Solana wallet: text/voice in, markdown replies, live **data cards** (portfolio, firewall, quote, smart-money, intel) and **confirm-before-execute** trade/limits cards. Read-only tools run server-side; state-changing intents return as proposals the browser re-quotes and runs through the existing spend guards + firewall + custody audit. Slash commands, copy/regenerate, localStorage persistence. See [docs/trading-copilot.md](docs/trading-copilot.md) |
| Real-funds risk acknowledgment | gate [public/risk-ack.js](public/risk-ack.js) `→ /legal/risk`, app wrapper [src/shared/risk-ack.js](src/shared/risk-ack.js), record endpoint [api/legal/risk-ack.js](api/legal/risk-ack.js), disclosure [public/legal/risk.html](public/legal/risk.html) | In-repo | Versioned, once-per-browser acceptance dialog every money-committing surface awaits before executing (trade, snipe, withdraw, swap, launch, x402, onramp — devnet exempt). Acceptances persist in `audit_log` (`risk-ack-accept`). See [docs/risk-acknowledgment.md](docs/risk-acknowledgment.md) |
| Global markets + coin detail pages | [pages/coins.html](pages/coins.html) + [src/coins-index.js](src/coins-index.js) `→ /coins`, [pages/coin.html](pages/coin.html) + [src/coin-page.js](src/coin-page.js) `→ /coin/:id`, backend [api/coin/](api/coin) (detail, ohlc, markets, news, global over [api/_lib/coingecko.js](api/_lib/coingecko.js)) | In-repo | CoinGecko-style markets index (global stats bar, sortable top-coins table, search, sparklines) + a rich detail page per coin (interactive chart, stats grid, related news, links). Design adopted from cryptocurrency.cv; accepts CoinGecko slugs or Solana mints. Docs: [docs/coin-pages.md](docs/coin-pages.md) |
| Market tools (heatmap, sentiment, gas, compare) | [pages/heatmap.html](pages/heatmap.html) + [src/heatmap.js](src/heatmap.js) `→ /heatmap`, [pages/fear-greed.html](pages/fear-greed.html) + [src/fear-greed.js](src/fear-greed.js) `→ /fear-greed`, [pages/gas.html](pages/gas.html) + [src/gas.js](src/gas.js) `→ /gas`, [pages/compare.html](pages/compare.html) + [src/compare.js](src/compare.js) `→ /compare`; backend [api/coin/fear-greed.js](api/coin/fear-greed.js), [api/coin/gas.js](api/coin/gas.js) | In-repo | Four tools extending Markets, same design system: treemap heatmap (market-cap-sized tiles), Fear & Greed gauge + history, live Ethereum gas tracker (keyless `eth_feeHistory`), and up-to-4-coin compare (overlay perf + stats). All real key-free data; cross-linked from the markets table. Docs: [docs/coin-pages.md](docs/coin-pages.md) |
| Market tools II (screener, categories, exchanges, derivatives, converter, DeFi, chains, stablecoins) | Pages+JS `→ /screener /categories /exchanges /derivatives /converter /defi /chains /stablecoins`; backend [api/coin/](api/coin) (categories, exchanges, derivatives, rates) over CoinGecko + [api/defi/](api/defi) (protocols, chains, stablecoins) over DeFiLlama | In-repo | Eight more Markets tools, same design system: token screener + category rankings + exchange/derivatives tables + crypto⇄fiat converter (CoinGecko), plus a DeFiLlama trio — DeFi TVL by protocol, chains by TVL, stablecoins with peg health. All real key-free data; cross-linked from the markets table. Docs: [docs/coin-pages.md](docs/coin-pages.md) |
| BNB Chain campaign hub | [pages/bnb.html](pages/bnb.html) + [src/bnb.js](src/bnb.js) `→ /bnb`, pure helpers [src/bnb-hub-helpers.js](src/bnb-hub-helpers.js), live block-time API [api/bnb/block-time.js](api/bnb/block-time.js) over [api/_lib/bnb/chains.js](api/_lib/bnb/chains.js) `probeBlockTime` | In-repo · hub live, tracks rolling out | The campaign's front door: three feature cards (gasless agent onboarding, on-chain-gated 3D vault, real-time on-chain world), each claim traced to `prompts/bnb-chain/00-CONTEXT.md`'s verified facts (0.45s blocks — never 20k TPS or 250ms finality). Embeds a live block-time widget (real RPC measurement on every load). Each card self-detects liveness via a real HTTP probe against its track's route/API on the running deployment — a 404 renders a designed "coming soon" state, never a dead link — so cards auto-light-up as the sibling tracks below ship: gasless registration `→ /create-agent` + `api/bnb/register-agent.js` (prompt 03), vault `→ /vault` (prompt 12), on-chain world `→ /bnb-latency` (prompt 17) + the Explore on-chain toggle (prompt 16). Campaign root: [prompts/bnb-chain/](prompts/bnb-chain) |
| BABT holder check (BNB Chain) | Lib [api/_lib/bnb/babt.js](api/_lib/bnb/babt.js) `hasBabt()`, free API [api/bnb/babt-check.js](api/bnb/babt-check.js) `→ GET /api/bnb/babt-check?address=` | In-repo · shipped | Free, rate-limited on-chain check for whether a BSC address holds a Binance Account Bound Token (BABT) — a real, live, KYC-backed soulbound token (1.16M+ mainnet holders, verified via `eth_getCode`/`balanceOf` against the real contract `0x2B09d47D...5215D7c8`). Verification writeup + honest comparison vs. Gitcoin Passport/World ID/Coinbase attestations: [docs/bnb-babt-findings.md](docs/bnb-babt-findings.md). Spike prompt: `prompts/bnb-chain/20-babt-verification-spike.md`. |

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
packages/retarget/            → @three-ws/retarget          (humanoid bone canonicalizer + clip retargeting engine, extracted from src/)
packages/viewer-presets/      → @three-ws/viewer-presets
packages/defi-utils/          → @three-ws/defi-utils        (zero-dependency chain/token constants + address/amount validation + formatters, EVM + Solana; ported from SperaxOS)
packages/tool-sdk/            → @three-ws/tool-sdk          (typed MCP tool authoring — defineTool/defineExecutor + permission manifests + toMcpTools adapter; ported from SperaxOS)
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
npm).

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
