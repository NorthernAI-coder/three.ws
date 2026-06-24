# 31 · MCP Servers — Production Hardening

## Mission
Every published MCP server is correct, documented, paid-where-stated, and verifiably working against
its remote — so external agents can rely on three.ws tools.

## Context
- Servers: `mcp-server/`, `mcp-bridge/`, `packages/*-mcp/` (avatar-agent, pumpfun, ibm-watsonx,
  ibm-x402, three-token, threews-avatar). Tooling: `npm run audit:mcp`, `smoke:mcp`, `test:mcp`,
  `publish:mcp(:dry)`.
- Local server exposes paid tools (each quotes USDC price; `_meta` x402 payload) + one free tool
  (`forge_free`). Paid calls without payment return PaymentRequired structuredContent (v2 transport).

## Tasks
1. **Manifest audit:** `npm run audit:mcp` clean — names, descriptions, prices (USDC), and the v2
   PaymentRequired behavior correct for every paid tool; the free tool needs no payment/key.
2. **Remote smoke + tests:** `npm run smoke:mcp` and `npm run test:mcp` green against live remotes;
   document required env/creds; note any tool that needs interactive auth (may be absent headless).
3. **Tool correctness:** each tool's inputs/outputs match its schema and actually perform the action
   (forge_free returns a real GLB + viewer link; avatar/rig/mesh tools produce real assets; reads
   return real data). No stubbed tools.
4. **Errors:** invalid input → structured error; payment-required → correct 402 payload; never a crash.
5. **Docs + publishing:** each server's README accurate (install, auth, tools, pricing); `publish:mcp:dry`
   clean; versions consistent.
6. **Coin policy:** any token-related tool references only $THREE / runtime-supplied mints; never
   hardcodes another token.

## Acceptance
- `audit:mcp`, `smoke:mcp`, `test:mcp` all green; `publish:mcp:dry` clean.
- Every tool performs its real action; paid tools return correct 402 payloads; free tool needs no key.
- READMEs accurate; coin policy clean.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No stubbed tools/mocks; real actions + real data. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); pricing in USDC. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/31-mcp-servers.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
