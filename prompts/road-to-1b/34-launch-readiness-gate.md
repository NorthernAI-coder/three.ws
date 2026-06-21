# 34 — Launch-readiness gate & go-to-market QA

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 6 — Growth & business
**Owns:** the final cross-cutting QA pass; status page / runbook / incident docs; the go/no-go checklist.
**Depends on:** **everything (01–33).**  ·  **Parallel-safe with:** —

## Why this matters for $1B
This is the gate that says "ready." It aggregates every prior prompt's acceptance into a
single, evidence-backed go/no-go, plus the operational readiness (status, runbook,
incident response) a serious launch requires. No green here, no launch.

## Mission
Run a final end-to-end readiness pass that verifies every phase's acceptance holds
together in production conditions, and stand up the operational launch surface.

## Map
- The acceptance checklists of prompts 01–33; CLAUDE.md "Definition of done" + the
  self-review protocol; existing `audit:*` / `smoke:*` / `verify:*` scripts; observability
  from prompt 11.

## Do this
1. Re-run the full audit/test surface: `npm test`, `test:e2e`, `test:pages`,
   `audit:web`, `audit:pages`, `audit:handlers`, `audit:empty-handlers`, `check:images`,
   `verify:solana`, `smoke:onchain`, `audit:deploy`, `lint`, `typecheck` — all green.
2. Walk the top user journeys end to end in production-like conditions, on desktop and
   mobile, as a brand-new user (create agent, forge, launch, buy a skill, x402 pay).
3. Confirm every prompt 01–33 acceptance box is checked; list any exceptions with a
   risk-accepted rationale and owner.
4. Stand up operational readiness: a status page (ties prompt 11), an incident-response
   runbook, on-call/alert routing, and a rollback rehearsal (prompt 33).
5. Verify the changelog reflects all user-visible work (`npm run build:pages`) and is
   pushed to holders (`changelog:push`) post-deploy.
6. Produce a one-page go/no-go with evidence links; the platform is launch-ready only
   when it's all green.

## Must-not
- No "ship it anyway" with open Red items unless explicitly risk-accepted in writing.
- Do not skip the production-conditions walkthrough.

## Acceptance
- [ ] All audit/test/verify scripts green; every 01–33 acceptance confirmed or risk-accepted.
- [ ] Top journeys verified in production-like conditions on desktop + mobile.
- [ ] Status page + runbook + alerting + rollback rehearsal in place; go/no-go signed off.
- [ ] Changelog complete and pushed; `npm test` green.
