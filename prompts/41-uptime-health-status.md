# 41 · Uptime, Health Checks & Status Page

## Mission
The platform stays up, knows when it isn't, and tells users honestly. Health checks on every critical
dependency, automated uptime monitoring, and a public status page.

## Context
- Dependencies: Vercel functions, DB, Solana RPC, x402 settlement, LLM/3D providers (NVIDIA NIM,
  Anthropic/OpenAI proxies, Meshy/Tripo/etc.), TTS, R2, multiplayer server, MCP remotes.

## Tasks
1. **Health endpoints:** a `/api/health` (and per-subsystem checks) that verifies DB, RPC, provider
   reachability, and returns structured status — without leaking secrets or doing expensive work.
2. **Uptime monitoring:** external monitors on the homepage, key APIs, MCP remotes, and the
   multiplayer server; alert on downtime (coordinate with prompt 36 alerting).
3. **Dependency degradation:** when a provider is down, the UI shows the right state (engine
   "unavailable", "try the free lane", "payments temporarily unavailable") instead of failing hard.
4. **Status page:** a public status page (or integrate a provider) reflecting subsystem health +
   incident history; link it from the footer.
5. **Smoke checks:** wire `smoke:mcp`, `smoke:onchain`, `smoke:agent-wallet`, `pump:smoke` into a
   scheduled health run; surface failures.
6. **Incident runbook:** `docs/ops/incidents.md` — who, what, how to triage common outages.

## Acceptance
- `/api/health` + per-subsystem checks return accurate status; external uptime monitors + alerts live.
- Provider-down states degrade gracefully in the UI; public status page live + linked.
- Scheduled smoke checks running; incident runbook documented.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs; health checks must reflect reality and never leak secrets. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
