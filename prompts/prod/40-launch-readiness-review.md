# 40 — Launch-readiness review (the final gate)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth (final gate)
**Owns:** the whole platform — a top-to-bottom verification that prompts `01`–`39` actually landed.
**Depends on:** all prior prompts.

## Why this matters for $1B
This is the gate that ensures the program produced a platform you'd actually stake the
company on. It's the difference between "we did a lot of work" and "we are
production-ready." Run it as an adversarial reviewer, not a cheerleader.

## Mission
Verify, end to end, that the platform meets the production + growth bar set by this
program and by `/CLAUDE.md`'s Definition of Done — and produce a single, honest
readiness report with any remaining gaps and their owners.

## Do this
1. **Re-verify each phase against reality, not claims.** For prompts `01`–`39`, spend
   a few minutes confirming the Acceptance checklist actually holds in the live app/
   code today (things regress). Note any that slipped.
2. **Critical-path walkthrough in a real browser** (desktop + mobile, both themes):
   land → onboard → forge a model → create/own an agent → buy a skill → make an x402
   payment → launch → share. Every step works, every state designed, zero console
   errors, zero dead ends.
3. **Money paths, adversarially:** attempt double-charge, replay, price tampering,
   and unauthorized withdrawal — confirm each is blocked (prompts `07`, `18`).
4. **Quality gates green:** `npm run lint`, `npm run typecheck`, `npm run test:all`,
   `npm run audit:deploy`, `audit:pages`, `audit:web`, `audit:mcp`, `seo:meta`,
   `check:images`, `verify`, `smoke:onchain`, `smoke:mcp` — run them; all pass.
5. **Cross-cutting spot-audit:** a11y (axe on top flows), Lighthouse perf on key
   pages, mobile at 320/768/1440, secret scan, `npm audit` — confirm prompts `05`,
   `07`, `09`, `10`, `11` held.
6. **The one-coin rule:** final grep across code/copy/tests/docs/metadata — only
   $THREE, plus the two runtime-data exceptions. Zero other coins (prompt `22`).
7. **Observability + ops:** dashboards live, alerts wired, status page up, rollback
   practiced, backups restore-tested (prompts `25`–`28`).
8. **Growth instrumentation:** activation/retention/revenue funnels reporting real
   numbers; referral + notifications working (prompts `30`–`35`, `39`).
9. **Legal/safety:** ToS/privacy/AUP live, consent working, moderation + reporting
   live, data export/delete working (prompts `36`, `37`).
10. **Produce `docs/launch-readiness.md`:** a dated report with a per-area
    GREEN/YELLOW/RED status, the evidence checked, every remaining gap, its severity,
    and a clear owner/next step. Be honest — RED where it's RED. Do not claim done for
    anything you could not verify (`/CLAUDE.md`).

## Must-not
- Do not rubber-stamp. If you can't verify something, mark it unverified — never green.
- Do not skip the adversarial money-path checks.
- Do not let the one-coin grep slide.

## Acceptance
- [ ] Prompts `01`–`39` Acceptance re-verified against the live app/code; slips logged.
- [ ] Full critical-path walkthrough passes desktop + mobile + both themes, zero console errors / dead ends.
- [ ] Adversarial money-path checks all blocked.
- [ ] All quality gates + audit scripts green.
- [ ] Cross-cutting spot-audit (a11y/perf/mobile/secrets/`npm audit`) passes.
- [ ] One-coin grep clean (only $THREE + the two runtime exceptions).
- [ ] Observability/ops + growth + legal/safety verified live.
- [ ] `docs/launch-readiness.md` written: dated, per-area RAG status, gaps, owners.
