# 20 — Fact-check v2: free sample lane + published accuracy benchmark

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Fact-check is one of the catalog's defensible products — sourced verdicts with SHA-256
attestations ARE useful to agents — but at $0.10 with zero proof of quality, nobody tries it.
Fix the funnel: a free sample lane, and a published accuracy benchmark that makes the quality
claim checkable instead of asserted.

## Context

- Read `api/x402/fact-check.js` end to end: the search + LLM analysis chain, verdict taxonomy
  (supported/contradicted/mixed/insufficient), authority weighting, strictness parameter,
  attestation scheme, cost breakdown, which env vars it needs.
- Free-lane mechanics: per-IP daily quota (suggested 3 free checks/day) via the platform's
  quota mechanism (`api/_lib/rate-limit.js` or the daily pattern used elsewhere — find it);
  above quota → the existing 402. Free-lane responses are complete real checks (same chain),
  marked `lane: 'free'` — never a degraded fake.
- Benchmark: a committed suite of claims with KNOWN verdicts, spanning all four verdict
  classes and difficulty levels. Claims must be time-stable (not "X is the current president"
  — verdicts that won't drift), non-partisan, and include crypto-domain claims where token
  references follow the $THREE rule (use $THREE or protocol-generic facts like "Solana uses
  proof of history", never third-party coin promotion).

## Tasks

1. **Free lane.** Implement the quota + fall-through on the existing route. The 402 for
   over-quota callers states the reset time and the paid price. Response schema gains `lane`.
2. **Benchmark suite.** `tests/fixtures/fact-check-benchmark.json`: ≥40 claims —
   10 per verdict class — each `{ claim, expected_verdict, rationale, difficulty }`. Write
   them yourself with care; they are the product's quality bar.
3. **Benchmark runner.** `scripts/fact-check-benchmark.mjs`: runs the suite through the REAL
   chain (requires the env vars; exits with a clear message naming them if absent), scores
   accuracy overall + per class + per difficulty, writes
   `data/_generated/fact-check-benchmark.json` (score, per-class table, run date, chain
   config). Run it for real; if env is present, commit the genuine results. If the env
   genuinely isn't available locally, ship the runner + a `not yet run in this environment`
   state on the page (see next task) that renders honestly — never fabricate scores.
4. **Public accuracy page.** `/fact-check` page (follow the repo's page pattern; entry in
   `data/pages.json`; `npm run build:pages` green): what the service does, how the benchmark
   works (link the claims file — transparency is the point), latest scores from the generated
   JSON (designed empty state when unrun), a live "try one free check" box calling the real
   endpoint from the browser (loading/error/result states designed), and the x402 pricing.
5. **Description update.** Rewrite the bazaar description: first sentence = uniqueness
   ("Sourced fact-checking with cryptographic attestations — verdicts you can audit, with a
   published accuracy benchmark"), mention the free daily lane.
6. **Tests** in `tests/api/fact-check-v2.test.js`: quota fall-through, `lane` field, benchmark
   fixture schema validation (all classes covered, ≥40 entries), runner scoring math against
   a synthetic result set. Targeted vitest + `npm run audit:x402-catalog` until green.
7. **Docs:** update fact-check coverage in `docs/api-reference.md`. Changelog entry
   (`improvement`): fact-check now has a free daily lane and a public accuracy benchmark.
8. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Free lane real and quota'd, benchmark suite + runner shipped (real scores committed if env
allows; honest unrun state otherwise), `/fact-check` page live and browser-verified, rewritten
listing, tests + audit green, docs + changelog shipped, committed, pushed.
