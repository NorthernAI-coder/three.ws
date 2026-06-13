# Developer Resources & Satellite Repos — Plan

**Status:** Proposed, not started
**Drafted:** 2026-06-13
**Problem:** All developer-facing material (examples, SDK quickstarts, guides) lives inside the monorepo, invisible to developers browsing GitHub. Platforms at the bar we're aiming for (Vercel, Stripe, Anthropic) present curated satellite repos — `vercel/examples`, `stripe-samples`, `anthropic-cookbook` — that act as the discovery and onboarding front door.
**Goal:** A public `examples` repo (under a `three-ws` GitHub org) seeded from the monorepo and kept in sync by a one-way export script, with npm packages publishable so the examples actually install.

---

## 1. What we already have (the raw material)

No new content needs writing. The job is re-presenting what exists.

### 1.1 Runnable examples (`examples/`)

| Example | What it shows |
|---|---|
| `coach-leo/` | Full agent build |
| `pump-fun-agent/` | Agent wired to the pump.fun feed |
| `three-concierge/` (+ `.html`) | Embedded concierge agent |
| `metamask-agent-wallet/` | Wallet-connected agent |
| `agenc-task-roundtrip/` | Agent task round-trip |
| `minimal.html`, `two-agents.html`, `web-component.html`, `widget-rpc.html`, `embed-test.html` | Single-file embed patterns |
| `skills/` | Skill examples |

### 1.2 SDKs

| SDK | Location |
|---|---|
| Core SDK | `sdk/` (includes `sdk/example/`) |
| Solana agent SDK | `solana-agent-sdk/` |
| Agent payments SDK | `agent-payments-sdk/` |
| Agent protocol SDK | `agent-protocol-sdk/` |
| Agent UI SDK | `agent-ui-sdk/` |
| Avatar SDK | `avatar-sdk/` |

### 1.3 MCP packages (`packages/`)

`avatar-agent-mcp`, `avatar-cli`, `avatar-schema`, `ibm-watsonx-mcp`, `ibm-x402-mcp`, `pumpfun-mcp`, `three-token-mcp`, `threews-avatar-mcp`.

### 1.4 Docs

60+ guides in `docs/` (architecture, authentication, embedding, MCP, multi-agent, on-chain agents, …), already wired into the site build and sitemap.

---

## 2. Constraints that shape the plan

These are why the obvious approach ("just push copies to new repos") fails here.

1. **No CI on this account.** GitHub Actions are unavailable (all workflows deleted 2026-06-11). The standard satellite-sync pattern — a workflow pushing subtrees on every merge — cannot run. Sync must be a local script invoked from the existing push routine, or satellites rot.
2. **Mirror maintenance already bites.** We maintain one mirror (`nirholas/3D-Agent`, push-only) and it has caused destructive history merges. Every additional repo multiplies that class of risk. Satellites must be strictly one-way exports, never pulled from.
3. **~~npm packages 404.~~ RESOLVED (2026-06-13).** All public packages are now published on npm under the single `@three-ws/*` scope, and all 14 MCP servers (8 stdio + 6 remote) are registered in the official MCP registry. `npm install @three-ws/sdk` and `npx -y @three-ws/mcp-server` now work, so an examples repo no longer fails on its first instruction.
4. **A stale satellite is worse than none.** Broken examples in a standalone repo are anti-marketing. Anything we publish must be smoke-tested by the export script before it pushes.

---

## 3. The plan

### Phase 0 — Prerequisite: publish to npm

- Obtain `NPM_TOKEN` (user-provided; not recoverable from `vercel env pull`).
- Run the existing publish pipeline for the MCP servers and SDKs.
- Until this lands, any satellite example must target the **hosted MCP/API endpoints** (which work today) rather than npm installs.

### Phase 1 — GitHub org

- Create the `three-ws` org. An org page with pinned repos signals project maturity in a way more repos under a personal account cannot.
- Transfer nothing initially; `nirholas/three.ws` stays the canonical monorepo. (Moving the canonical repo is a separate decision with deploy-pipeline implications — Vercel is linked to it.)

### Phase 2 — `three-ws/examples` repo

One satellite, not three. Tutorials are examples with longer READMEs; they live here. A separate docs repo is explicitly out of scope (§5).

Proposed layout:

```
examples/
├── README.md              # index table: example → what it shows → run command
├── LICENSE
├── quickstarts/           # one folder per SDK, copy-paste minimal
│   ├── sdk/
│   ├── solana-agent-sdk/
│   ├── agent-payments-sdk/
│   └── mcp-server/
├── agents/                # full agent builds
│   ├── coach-leo/
│   ├── pump-fun-agent/
│   ├── three-concierge/
│   └── metamask-agent-wallet/
├── embeds/                # single-file HTML patterns
│   ├── minimal.html
│   ├── two-agents.html
│   ├── web-component.html
│   └── widget-rpc.html
└── tutorials/             # long-form walkthroughs (start: docs/internal/tutorial-build-pai-site.md, adapted)
```

Repo-level requirements:

- Root README states: **source of truth is the monorepo; PRs and issues belong there** (with links). Satellite accepts no direct contributions.
- Every example folder has its own README: what it does, prerequisites, exact run commands, link to relevant docs page on three.ws.
- Every example pins to working surfaces — published npm packages (post Phase 0) or hosted endpoints — never relative monorepo paths.

### Phase 3 — One-way export script

`scripts/export-satellites.mjs`, run locally as part of the push routine (no CI available):

1. Copy curated paths (`examples/` subset, SDK quickstarts) into a staging dir, rewriting any monorepo-relative imports to published package names.
2. Smoke-test: `npm install` + run each example's check command in staging. Abort export on any failure — never push broken examples.
3. Force-push staging to `three-ws/examples` as a single-parent history (satellite history is disposable; monorepo is truth).
4. Wire as `npm run export:satellites`; document in CLAUDE.md push routine. **Never pull/fetch from satellites** — same rule as the 3D-Agent mirror.

### Phase 4 — Cross-linking (what makes it pay off)

- three.ws docs pages link to the matching example folder; examples README links back to docs and the live platform.
- `llms.txt` / `llms-full.txt` reference the examples repo.
- Org profile README pins `examples` + monorepo.
- Changelog entry + Telegram push announcing the developer resources (this is user-visible — gets a `data/changelog.json` entry when shipped).

---

## 4. Sequencing & effort

| Phase | Depends on | Effort |
|---|---|---|
| 0. npm publish | `NPM_TOKEN` from user | Small (pipeline exists) |
| 1. Org creation | User action (GitHub UI) | Minutes |
| 2. Examples repo seed | Phases 0–1 | ~1 day: curate, write READMEs, pin versions |
| 3. Export script | Phase 2 | ~half day incl. smoke-test harness |
| 4. Cross-linking | Phase 2 | Small, rolling |

If `NPM_TOKEN` is delayed: ship Phase 2 against hosted endpoints only, add npm-install quickstarts when Phase 0 lands.

---

## 5. Explicitly not doing (and why)

- **Separate documentation repo.** Docs are wired into the site build (SEO injectors, `pages.json` as sitemap source of truth). Extracting them creates a second source of truth that drifts. Discovery is served by linking docs prominently from the examples README.
- **Separate tutorials repo.** Fragments attention; tutorials are `examples/tutorials/`.
- **Two-way sync or accepting PRs on satellites.** Sync conflicts without CI are unmanageable; the 3D-Agent mirror already demonstrated the failure mode.
- **Moving the canonical repo to the org (for now).** Vercel deploys hang off `nirholas/three.ws`; relinking was fixed 2026-06-11 and shouldn't be churned without a deliberate migration plan.

---

## 6. Open decisions

1. **Org name** — `three-ws` proposed (`three.ws` isn't a valid org slug). Alternative: keep everything under `nirholas`.
2. ~~**npm scope**~~ — RESOLVED: consolidated to a single `@three-ws/*` scope; the former `@3d-agent/*` packages were repointed before publish.
3. **Announce timing** — changelog + Telegram on examples-repo launch, or wait until npm installs work end-to-end.
