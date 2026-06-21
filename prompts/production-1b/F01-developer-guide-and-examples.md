# F01 — Unified developer guide + runnable examples + quickstarts

> Phase F · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
three.ws ships ~13 SDKs + ~7 MCP servers — a genuine developer platform — but a developer
today must do "README archaeology" across 20 packages to ship anything. Network effects come
from frictionless adoption. Build the single front door + runnable examples that turn a
curious dev into an integrated one in 15 minutes.

## Where this lives (real files)
- SDKs: `sdk/` (`@three-ws/sdk`), `solana-agent-sdk/`, `agent-payments-sdk/`, `agent-protocol-sdk/`, `avatar-sdk/`, `walk-sdk/`, `page-agent-sdk/`, `tour-sdk/`.
- MCP: `mcp-server/`, `packages/*-mcp/`.
- `STRUCTURE.md` (surface map), `README.md`, `examples/`.

## Build this
1. **Developer guide:** `docs/DEVELOPER_GUIDE.md` — an overview of every SDK/MCP + when to use which, a quick-start matrix (EVM vs Solana vs MCP vs avatar embed), architecture + flow diagrams ("agent pays with $THREE", "image → rigged avatar", "embed a 3D agent"), and links into each package.
2. **Runnable examples:** under `examples/`, create self-contained projects that run with `npm install && npm run dev`:
   - `agent-basic` — init + mount an agent panel
   - `agent-avatar` — embed `<agent-3d>`, play an animation
   - `agent-payments` — invoke a paid skill via x402
   - `agent-solana-identity` — SIWS + on-chain agent registration
   - `mcp-client` — call three.ws MCP tools programmatically
3. **Quickstarts in READMEs:** each SDK README opens with a copy-paste 30-second quickstart that actually works.
4. **CONTRIBUTING + onboarding:** `CONTRIBUTING.md` (fork/branch/commit/test/release flow) and a "build order" note so a fresh clone builds first try.
5. **Discoverable:** link the guide + examples from `README.md`, the site's developer/docs page, and `llms.txt`.

## Out of scope
- SDK test coverage + release automation (**F02**) and MCP reconciliation (**F03**).

## Definition of done
- [ ] `docs/DEVELOPER_GUIDE.md` covers every SDK/MCP with a quick-start matrix + diagrams.
- [ ] All 5 examples run clean with `npm install && npm run dev` against real services (free lanes where possible).
- [ ] Every SDK README has a working 30-second quickstart; CONTRIBUTING + build order documented + linked.
- [ ] `npx vitest run` green; changelog entry (docs/sdk); committed + pushed to both remotes.

## Verify
- From a clean checkout, follow the guide to run each example to a working result.
