# 17 — x402 developer toolkit: echo, debugger, receipt verifier

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Make three.ws the test bench every x402 developer uses. Three free tools — a payment echo, a
402-exchange debugger, and an attestation/receipt verifier — plus one docs page consolidating
the half-hidden dev endpoints that already exist (`schema-check`, `rate-limit-probe`,
`permit2-paid-demo`). Every developer who tests against us discovers the paid catalog. This is
the cheapest distribution we can buy.

## Context

- Read first: `api/x402/schema-check.js`, `api/x402/rate-limit-probe.js`,
  `api/x402/permit2-paid-demo.js` (what they already cover — don't duplicate),
  `api/_lib/x402-paid-endpoint.js` (the settlement rail and how a payment envelope is parsed/
  verified), `api/_lib/x402-spec.js` (schema builders/validators), and the attestation scheme
  used by fact-check/tutor (grep `attestation` / `sha-256` under `api/x402/` and `api/_lib/`).
- The platform also runs a facilitator (`api/x402-facilitator/`) — the debugger should reuse
  its verification primitives rather than re-implementing signature checks.
- All three new tools are FREE and must be bazaar-discoverable (facilitators index free
  resources too — see how `dance-tip` declares Free, and how `declareHttpDiscovery` +
  `THREEWS_SERVICE` work in `api/_lib/x402/bazaar-helpers.js`). Rate limit each per-IP
  (30/min) — free ≠ abusable.

## Tasks

1. **Echo** — `POST /api/x402/echo`: returns exactly what the caller's request looked like
   from a server's perspective: method, relevant headers (payment header parsed if present —
   decoded envelope with signature fields REDACTED to prefixes), body, and — when a payment
   payload is present — the rail's verification verdict (valid/invalid + why) WITHOUT
   settling. This is "httpbin for x402".
2. **Debugger** — `POST /api/x402/debug`: caller pastes a JSON blob of their failed exchange
   (`{ challenge?, payment?, response? }` — any subset) and gets a structured diagnosis:
   schema problems (via `x402-spec` validators), network/chain mismatches, amount mismatches,
   expiry issues, common footguns (wrong `x402Version`, base-vs-solana confusion, atomics vs
   decimal). Diagnosis list format: `[{ severity, field, problem, fix }]`. Cover at minimum
   the failure modes our own rail can produce — enumerate them from
   `x402-paid-endpoint.js`'s error paths.
3. **Receipt verifier** — `GET/POST /api/x402/verify-receipt`: given an attestation object
   from any three.ws paid response (fact-check/tutor style SHA-256 attestations), recompute
   and confirm/deny integrity; given a settlement tx reference, check it on the right chain
   (reuse facilitator/x402 lib primitives). Response says exactly what was and wasn't
   verifiable.
4. All three: precise 400s on malformed input, free-tier rate limit, bazaar discovery with
   descriptions whose first sentence targets developers ("Debug your x402 integration
   against a live server — free").
5. **Tests** in `tests/api/x402-dev-toolkit.test.js`: echo redaction (no full signatures in
   output — assert), debugger diagnosis matrix (feed it real captured malformed exchanges —
   generate them by calling our own rail wrongly in the test), receipt verifier
   confirm/deny/partial cases. Targeted vitest + `npm run audit:x402-catalog` until green.
6. **Docs:** new `docs/x402-dev-tools.md` linked from `docs/start-here.md` — all SIX dev
   tools (three new + schema-check + rate-limit-probe + permit2-paid-demo), each with a
   runnable curl and what it's for. Changelog entry (`feature`): free x402 developer toolkit.
7. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Three free dev tools live and discoverable, signatures never echoed whole, diagnosis covers
our rail's real failure modes, docs page unifies all six tools, tests + audit green, changelog
shipped, committed, pushed.
