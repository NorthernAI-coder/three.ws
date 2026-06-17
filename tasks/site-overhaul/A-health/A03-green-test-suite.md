# A03 — Get the test suite green

**Track:** Health · **Size:** M · **Priority:** P1

## Goal
`npm test` currently reports **14 failing tests across 7 files** (3164 passing). Drive it to
green, or — where a failure reflects intentional churn from concurrent work — quarantine with a
documented reason, never by deleting coverage.

## Why it matters
A red suite means no one trusts CI, and real regressions hide in the noise. At least one failure
is a genuine security-relevant regression.

## Context
- Run `npm test 2>&1 | tail -60` to see the current failures. Known real one:
  - `tests/api/webhooks-replicate.test.js:214` — expects `200` for a Replicate prediction that matches no job row ("ignored"), but the handler now returns `401`. Either the webhook auth changed and the test is stale, or auth is rejecting unrelated-but-valid webhooks. **Investigate the handler** (`api/webhooks/replicate*`) and decide which is correct — an unrelated prediction should be acknowledged (`200 ignored`), not rejected, unless the signature genuinely failed.
- Per the swarm context, some redness is transient churn from ~20 agents editing concurrently. Re-run before assuming a failure is yours.

## Scope
- Triage all 7 failing files. For each: fix the code if it's a real bug; fix the test if the contract legitimately changed; skip with `it.skip` + a `// reason:` comment only if it depends on unfinished concurrent work.
- Do **not** mask failures by loosening assertions.

## Definition of done
- `npm test` is green, or every remaining skip has a one-line documented reason.
- The webhooks-replicate auth behavior is correct and explained in the PR description.

## Verify
- `npm test 2>&1 | tail -10` shows 0 unexpected failures.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/A-health/A03-green-test-suite.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
