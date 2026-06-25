# Prompt Task Priority — cross-cutting triage

Companion to [`00-README.md`](00-README.md). The README sequences the core `01`–`50` catalog
into phases; this file ranks **every** prompt task (core + the 10 innovation programs) into
priority tiers so you know what to run first when launch is the goal.

## How priority was assigned

A task ranks higher when it touches one or more of:

1. **Money path** — real funds move (x402, wallet funding, pump.fun launch, on-chain contracts, auto-rig GPU spend).
2. **Security / consent** — exploitable surface, leaked secrets, SSRF, open spend, custody risk.
3. **Correctness & integrity** — broken builds, dead paths, orphaned jobs, the `$THREE`-only invariant.
4. **Launch-gating** — a credible production launch cannot happen without it.
5. **Active development** — recent commits + working notes show this code is hot right now
   (x402 replay guard, payment-proof reservation, auto-rig sweep) → finish what's in flight.

Innovation programs (subdirectories) are differentiation/moat work built **on top of** a shipped
core. They are ranked below the launch critical path even when individually ambitious — except
**`avatar-autorig`**, which is production hardening of a live, paying GPU path and is treated as core.

---

## P0 — Launch-blocking (money, security, integrity, the go/no-go gate)

Run these to green before any production launch. Phase-1 audits run **first** (they produce the
issue lists the rest consume); `50` runs **last** (it's the gate).

| Task | Why P0 |
|---|---|
| [01-production-readiness-audit](01-production-readiness-audit.md) | Master audit — produces the gap list everything else consumes. Run first. |
| [02-dead-paths-and-broken-links](02-dead-paths-and-broken-links.md) | Broken links/dead buttons = visibly unshippable. |
| [03-console-errors-warnings-sweep](03-console-errors-warnings-sweep.md) | Zero-console-error bar from CLAUDE.md "definition of done". |
| [04-build-deploy-artifact-integrity](04-build-deploy-artifact-integrity.md) | esbuild trap can corrupt `api/*.js`; bad artifacts break deploy. |
| [05-routing-and-404-audit](05-routing-and-404-audit.md) | `vercel.json` routing errors silently 404 live pages. |
| [08-error-handling-failsafes](08-error-handling-failsafes.md) | Failsafes at every network/user boundary — no lazy error propagation. |
| [14-security-review](14-security-review.md) | Headers, CORS scoping, secret hygiene, hardening. |
| [27-x402-payments](27-x402-payments.md) | **Money path + actively in flight** (replay guard, payment-proof reservation). |
| [28-wallet-connect-funding](28-wallet-connect-funding.md) | **Money path** — funding/connect must not lose or misroute funds. |
| [30-three-holder-gating](30-three-holder-gating.md) | The `$THREE`-only invariant + gating correctness — core platform contract. |
| [33-onchain-contracts](33-onchain-contracts.md) | **Money path** — contract review + Foundry/Anchor suites before mainnet. |
| [avatar-autorig/01-sibling-materialization](avatar-autorig/01-sibling-materialization.md) | Keystone refactor; the cost/consent + SSRF fixes build on the sibling model. |
| [avatar-autorig/02-completion-statemachine](avatar-autorig/02-completion-statemachine.md) | Orphaned `done`+`null` jobs on a **live paid GPU path** — correctness of real spend. |
| [avatar-autorig/03-ssrf-hardening](avatar-autorig/03-ssrf-hardening.md) | **Security** — SSRF on provider GLB fetches; recent commit shows this is active. |
| [avatar-autorig/04-cost-and-consent-gates](avatar-autorig/04-cost-and-consent-gates.md) | **Open spend path** — no rate limit/holder gate/spend ceiling; private avatars leak to a public URL. |
| [pumpfun-usdc-deploy](pumpfun-usdc-deploy.md) | Live inaugural USDC-paired launch — real SOL/USDC, irreversible. |
| [pumpfun-usdc-link-agent](pumpfun-usdc-link-agent.md) | Binds the launched mint to its `agent_identity` (DB integrity). |
| [pumpfun-usdc-monitor-gate](pumpfun-usdc-monitor-gate.md) | Watches the quote-mint whitelist gate that the launch depends on. |
| [50-final-launch-checklist](50-final-launch-checklist.md) | The go/no-go gate. **Run last.** |

## P1 — High (core product quality + the surfaces users actually touch)

Needed for a credible launch. Cross-cutting quality (Phase 2) + the primary product surfaces
(Phase 3) + the ops that keep a live money platform honest (Phase 4–5).

| Task | Bucket |
|---|---|
| [06-test-coverage-unit](06-test-coverage-unit.md) | Quality — regression safety net |
| [07-e2e-critical-flows](07-e2e-critical-flows.md) | Quality — the money/create journeys end-to-end |
| [09-accessibility-audit](09-accessibility-audit.md) | Quality — WCAG 2.1 AA |
| [10-responsive-mobile-audit](10-responsive-mobile-audit.md) | Quality — mobile is half the traffic |
| [11-performance-web-vitals](11-performance-web-vitals.md) | Quality — Core Web Vitals (3D is heavy) |
| [13-design-system-consistency](13-design-system-consistency.md) | Quality — visual coherence = trust |
| [15-forge-pipeline](15-forge-pipeline.md) | Surface — flagship text/photo→3D |
| [16-walk-sdk-companion-playground](16-walk-sdk-companion-playground.md) | Surface — Walk SDK |
| [17-avatar-create-edit-rig](17-avatar-create-edit-rig.md) | Surface — avatar pipeline (pairs with avatar-autorig) |
| [18-agent-studio](18-agent-studio.md) | Surface — agent create/configure/deploy |
| [19-marketplace](19-marketplace.md) | Surface — marketplace |
| [26-dashboard](26-dashboard.md) | Surface — dashboard-next |
| [29-pumpfun-launches](29-pumpfun-launches.md) | Money-adjacent — launch feed/tooling |
| [31-mcp-servers](31-mcp-servers.md) | Money-adjacent — paid MCP tools hardening |
| [34-solana-base-parity](34-solana-base-parity.md) | Correctness — cross-chain parity |
| [35-api-rate-limiting-abuse](35-api-rate-limiting-abuse.md) | Ops — abuse/cost protection |
| [36-observability-logging-alerting](36-observability-logging-alerting.md) | Ops — you can't run a money platform blind |
| [37-ci-cd-gates](37-ci-cd-gates.md) | Ops — quality gates in CI |
| [38-database-migrations](38-database-migrations.md) | Ops — data integrity / migrations |
| [41-uptime-health-status](41-uptime-health-status.md) | Ops — health checks + status page |
| [avatar-autorig/05-coverage-gaps](avatar-autorig/05-coverage-gaps.md) | Closes MCP `save_avatar` / fork-mid-rig / double-rig gaps |

## P2 — Medium (polish, growth, scale; post-core)

Improves conversion, retention, and scale once the core is solid.

| Task | Bucket |
|---|---|
| [12-seo-metadata](12-seo-metadata.md) | Growth |
| [20-gallery-discovery](20-gallery-discovery.md) | Surface |
| [21-social-club-city](21-social-club-city.md) | Surface |
| [22-onboarding-wizard](22-onboarding-wizard.md) | Activation |
| [23-feature-tour](23-feature-tour.md) | Activation |
| [24-scene-studio](24-scene-studio.md) | Surface |
| [25-search](25-search.md) | Surface |
| [32-published-sdks-docs](32-published-sdks-docs.md) | DevEx |
| [39-load-stress-testing](39-load-stress-testing.md) | Scale |
| [40-caching-cdn-assets](40-caching-cdn-assets.md) | Scale |
| [42-homepage-conversion](42-homepage-conversion.md) | Growth |
| [43-docs-completeness](43-docs-completeness.md) | DevEx |
| [44-legal-compliance](44-legal-compliance.md) | Compliance (raise to P0/P1 if legal sign-off blocks launch) |
| [45-analytics-funnels](45-analytics-funnels.md) | Growth |
| [46-notifications-email](46-notifications-email.md) | Retention |
| [47-i18n-completeness](47-i18n-completeness.md) | Growth |
| [48-pricing-monetization](48-pricing-monetization.md) | Growth (revenue surfaces) |
| [49-pwa-extension](49-pwa-extension.md) | Reach |

## P3 — Innovation programs (moat / differentiation, post-core)

Each subdirectory is a **multi-task program with its own `00-README` that defines internal run
order and dependencies** — execute a program as a unit, not interleaved. Ranked here by how close
each sits to real funds/custody (higher = harden sooner once core ships). `avatar-autorig` is the
deliberate exception promoted into P0/P1 above because it hardens a live paying path.

| Program | Tasks | Theme | Notes |
|---|---|---|---|
| [wallet-innovation/](wallet-innovation/00-README.md) | 6 | MPC custody, passkey step-up, session keys, proof-of-custody, streaming allowance/dead-man, clawback | **Custody-security primitives** — highest P3; hardens real wallets. |
| [living-wallet/](living-wallet/00-README-orchestration.md) | 6 | Autonomous treasury, proximity commerce, wallet copilot, embeddable SDK, economy feed | Autonomous money — safety framing is mandatory. |
| [agent-wallets/](agent-wallets/00-README-orchestration.md) | 3 + [innovation/](agent-wallets/innovation/00-README-innovation.md) 8 | Self-custodial avatar identity; money-cam, royalty streams, A2A economy, treasury autopilot, paywalls | Large program; overlaps living-wallet — dedupe before running both. |
| [agent-wallets-ii/](agent-wallets-ii/00-README-orchestration.md) | 3 | Intents copilot, IRL money drops/bounties, proof-of-reserves reputation | Wave II; depends on the wallet identity layer. |
| [vanity-frontier/](vanity-frontier/00-README.md) | 7 | ZK split-key vanity, sealed compute, proof-of-grind, semantic compiler, grind-to-earn, MCP concierge, 3D key ceremony | Vanity-address moat; flagship task needs honest crypto investigation. |
| [vanity-x402/](vanity-x402/00-README-orchestration.md) | 4 | Sealed wallet drops, threshold delivery, vanity-as-skill MCP, streaming pay-as-you-grind | Overlaps vanity-frontier — consolidate. |
| [living-agents/](living-agents/00-README.md) | 2 | Persistent companion HUD ("Anywhere Avatar"), integration/QA | Companion presence layer. |
| [embodiment/](embodiment/00-README.md) | 8 | Robot link, mind-sync, embodied motion, the face, on-chain soul, telepresence, kill-switch | Most forward-looking (physical robots); strongest moat, longest horizon. |

---

## Recommended execution waves

1. **Wave 0 (audit):** `01`–`05` — fan out in parallel chats, collect the gap lists.
2. **Wave 1 (P0):** money/security/integrity fixes above, including the `avatar-autorig`
   keystone→statemachine→ssrf→cost-gates chain and the pump.fun launch trio.
3. **Wave 2 (P1):** Phase-2 quality in parallel with Phase-3 core surfaces + Phase-4/5 ops.
4. **Wave 3 (P2):** growth, polish, scale.
5. **Wave 4 (P3):** innovation programs, one program at a time, each per its own README — start
   with `wallet-innovation` (custody) and dedupe the overlapping wallet/vanity programs first.
6. **Gate:** `50-final-launch-checklist` — go/no-go, run last.

> Reassess if signals change: promote `44-legal-compliance` to P0/P1 if legal sign-off blocks
> launch, and keep `27-x402` / `avatar-autorig` hot while their code is actively being touched.
