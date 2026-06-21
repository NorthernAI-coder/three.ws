# 27 — Go-live runbook & pre-launch checklist

**Phase 7. Serial. Run last** — it gates the whole program on a single
verifiable checklist.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform, deployed via Vercel,
mirrored to two GitHub remotes (`threeD` push-only, `threews` canonical). Read
[CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

A single authoritative pre-launch checklist that proves the platform is
production-ready, plus a documented, rehearsed go-live and rollback procedure.
This task does not add features — it verifies that everything the rest of this
program built is actually true, in production, right now.

## Why it matters

"Done" is a claim that has to be proven against real production, not asserted
from the editor. The launch is the moment all the prior work either holds or
doesn't. A rehearsed runbook with a one-step rollback is the difference between a
confident launch and a 3am scramble that costs trust you can't rebuild.

## Instructions

1. **Roll up the program.** Re-run the audit from
   [01 — scorecard](01-production-audit-scorecard.md) and confirm each prior
   prompt's Definition of Done is actually met. Produce a final
   `docs/audits/launch-readiness-YYYY-MM-DD.md` with a green/red status per
   prompt (02–26). Any red blocks launch.
2. **Production smoke, for real.** Against the production (or a production-mirror)
   deploy, verify the core journeys with real data: forge a model, create an
   agent, SIWE login, x402 checkout (a real small payment), a pump launch path on
   the appropriate environment, marketplace + trending load. Use the existing
   smoke scripts (`smoke:onchain`, `smoke:mcp`, `smoke:agent-wallet`,
   `pump:smoke`) and record results.
3. **The gate checklist** (every item must be verifiably true):
   - Zero TODO/stub/mock/dead-path regressions (re-run the Phase-1 greps).
   - All money/chain endpoints: authz + validation + rate-limit + idempotent.
   - Secrets clean; env validated at boot; nothing sensitive client-side.
   - Resilience + observability live; alerts verified to fire; `/status` green.
   - CWV "good" on top surfaces; 3D smooth on mobile.
   - CI gates green; coverage threshold met; E2E passing.
   - A11y AA on top surfaces; responsive at all breakpoints; every state designed.
   - SEO/OG/sitemap correct; trust pages live; $THREE-only verified by the guard
     test.
   - Backups/DB migrations applied and reversible (`npm run db:status`).
4. **Capacity & limits.** Confirm rate limits, RPC quotas, function concurrency,
   and DB connection limits are sized for an expected launch spike, and that
   degradation (from [10](10-resilience-external-calls.md)) is graceful under
   load. A light load test on the hottest read path is ideal.
5. **Deploy & rollback procedure.** Document the exact deploy steps
   (`build:all` → `check:dist` → `audit:deploy` → deploy, pushing to BOTH
   remotes) and a one-command rollback to the previous good deploy. Note the
   CLAUDE.md trap: `npx vercel build` can overwrite `api/*.js` with bundles —
   include the guard/recover step. Rehearse the rollback once.
6. **Comms plan.** Prepare the launch changelog entries
   (`data/changelog.json` → `npm run build:pages` → `npm run changelog:push`),
   the Telegram/X announcements ($THREE-compliant copy), and a clear owner for
   each during launch.
7. **Go/no-go.** The launch-readiness doc ends with an explicit GO or NO-GO and,
   if NO-GO, the specific blocking items.

## Definition of done

- [ ] `docs/audits/launch-readiness-<today>.md` with green/red per prompt 02–26
      and an explicit GO/NO-GO.
- [ ] Production (or mirror) smoke of every core journey passed with real data,
      including a real small x402 payment; smoke-script output recorded.
- [ ] The full gate checklist is verifiably true (each item evidenced, not
      asserted).
- [ ] Capacity sized for a launch spike; graceful degradation confirmed under a
      light load test.
- [ ] Deploy + one-command rollback documented AND rollback rehearsed once.
- [ ] Launch comms (changelog + announcements) prepared, $THREE-compliant, with
      owners.
- [ ] Pushed to BOTH remotes per CLAUDE.md when shipping.
- [ ] Changelog: prepare the launch entries (don't double-post).
