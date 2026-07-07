# 20 — Retire the Dead Endpoints from the Agent Catalog

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Why
These endpoints are why our scan page looks like a graveyard. They dilute the good products
and signal low quality to any agent browsing. Remove them from the agent-facing catalog.

## Targets + the rule for each
For EACH target: first `grep` the frontend/src (`src/`, `public/`, pages) for an internal
consumer.
- **Has an internal consumer** (e.g. `dance-tip` → `/club`, `three-intel` → `/play` kiosk):
  KEEP the route working for that page, but REMOVE it from the agent-facing x402 discovery
  (its `api/wk.js` mirror block) and any bazaar catalog so it stops appearing as a product on
  x402scan. Add a header comment: "internal-use only; not an agent product."
- **No internal consumer**: fully remove — delete the route file, its `api/wk.js` discovery
  block, its `_lib/x402-prices.js` entry, its tests, and any dead imports. Leave no orphan.

| Endpoint | Expected disposition (verify with grep) |
|---|---|
| `dance-tip` | internal (/club) → de-list from agent catalog, keep for club |
| `three-intel` | internal (/play kiosk) → de-list from agent catalog, keep for town |
| `fact-check` | me-too LLM → remove if no consumer |
| `tutor` | me-too LLM → remove if no consumer |
| `revenue-vision` / `crypto-intel` | me-too LLM → remove if no consumer |
| `mint-to-mesh` + `mint-to-mesh-batch` | cube novelty → remove if no consumer; note "real version = Forge" |

Do NOT touch: `forge`, `vanity*`, `pump-launch`, `agent-reputation`, `onchain-identity-verify`,
`mcp`, `model-check`/`symbol-availability` (those last two are being freed by prompts 13/07 —
if their free replacements exist, add a redirect note; otherwise leave them).

## Correctness
After edits, `node scripts/verify-x402-discovery.mjs` MUST pass (no dangling discovery
entries). `npm test` MUST pass (remove/adjust tests for deleted routes). No broken imports,
no dead references anywhere (grep for each removed slug across the repo). The `/club` and
`/play` pages must still work — load them in `npm run dev` and confirm.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] Per-endpoint disposition table in PROGRESS.md with the grep evidence that drove each call.
- [ ] `scripts/verify-x402-discovery.mjs` + `npm test` green (paste output).
- [ ] `/club` and `/play` verified still working in dev (whatever kept internal endpoints).
- [ ] Zero orphaned references (paste the grep confirming each removed slug is gone).
- [ ] `data/changelog.json` (tags: `improvement`) — "Trimmed low-value endpoints so agents find
      the tools that matter" (holder-readable; don't enumerate coin specifics).
