# Task 02 — Self-Hosted Facilitator: Routing, Defaults, and Truthful Docs

## Mission

Make the self-hosted facilitator the settlement path for the ring so that **no
third party ever touches a ring settlement**, and make the configuration
truthful: today `.env.example` claims the self-hosted facilitator is
"always-on" while the code defaults Solana settlement to PayAI and the
facilitator itself to disabled. After this task, a correctly-enveloped deploy
settles ring payments through `/api/x402-facilitator`, and a mis-enveloped one
says so loudly instead of silently routing volume elsewhere.

## Context you must know

- `api/_lib/env.js:742-748` — `X402_FACILITATOR_URL_SOLANA` defaults to
  `https://facilitator.payai.network`.
- `api/_lib/x402-spec.js:242-248` — `facilitatorFor()` is a pure env lookup; no
  awareness of the self-hosted facilitator.
- `api/_lib/x402/self-facilitator.js:62-63` — `SELF_FACILITATOR_ENABLED` is
  `X402_SELF_FACILITATOR_ENABLED === 'true'`, default false.
- `api/x402-facilitator/[action].js:89-96` — 503 `self_facilitator_disabled`
  when off; `/supported` (78-85) is the public probe; every op logged to
  `x402_self_facilitator_log` (44-55).
- `.env.example:357` documents the PayAI default; `.env.example:365` **falsely**
  says the Solana self-hosted facilitator is "always-on".
- `api/x402-status.js` — `probeFacilitators()` checks configured facilitators'
  `/supported`.
- Buyer-side settlement call sites route through `facilitatorFor()` — trace all
  of them (`api/_lib/x402/pay.js`, `api/_lib/x402-buyer-fetch.js`,
  `api/_lib/x402-buyer-axios.js`, `packages/x402-mcp/src/lib/x402-buyer.js`)
  before changing behavior.

## Tasks

1. **Route to self when enabled.** In `facilitatorFor()` (or a thin wrapper it
   calls — pick the seam that covers ALL call sites), when
   `SELF_FACILITATOR_ENABLED` is true and the network is Solana, resolve to our
   own facilitator URL (`https://three.ws/api/x402-facilitator`, overridable via
   `X402_FACILITATOR_URL_SOLANA` still winning if explicitly set to a different
   self URL — an explicit env always wins; the *default* is what changes when
   the flag is on). External facilitators remain the default only when the
   self-facilitator is off.
2. **Fail loud, not silent.** When `X402_RING_SELF_PAY=true` or a ring pipeline
   is invoked while settlement would route to an external facilitator, log one
   structured warning per boot (not per call) naming the misconfiguration, and
   surface it in `/api/x402-ring` output as `config_warnings: [...]`.
3. **Boot-time config validation.** Add a `validateRingConfig()` export (new,
   in `api/_lib/x402/self-facilitator.js` or a sibling `ring-config.js`) that
   returns a list of structured findings: facilitator off, URL pointing
   external, missing treasury secret, missing fee-payer pubkey, price>cap
   contradiction (`priceFor('ring-settle')` vs `VOLUME_PER_RUN_CAP_ATOMIC`),
   self-pay off. Wire it into `/api/x402-ring` and `/api/x402-status`.
4. **Truthful `.env.example`.** Fix line ~365 and the surrounding x402 block:
   document the real defaults, the exact env set required for the ring
   (mirror `scripts/x402-ring-setup.mjs:79-92`), and that
   `X402_SELF_FACILITATOR_ENABLED=true` + self URL are BOTH required.
5. **Probe coverage.** Ensure `api/x402-status.js` always probes the self-hosted
   facilitator's `/supported` when the flag is on (even if an external URL is
   also configured) and reports it as a distinct entry.
6. **Tests.** Extend the existing x402 test files (find them with
   `ls tests/ | grep -i x402` and match their style): `facilitatorFor()`
   resolution matrix (flag on/off × env set/unset), `validateRingConfig()`
   finding matrix. Pure logic — no network.
7. **Docs.** Update `docs/x402-ring-economy.md` "Turning it on" to match the new
   resolution behavior. Add a `data/changelog.json` entry (tags: `fix`,
   `infra`) in holder-readable language.

## Files you own

`api/_lib/x402-spec.js`, `api/_lib/x402/self-facilitator.js` (additive only),
`api/x402-status.js`, `api/x402-ring.js` (config_warnings only),
`.env.example`, `docs/x402-ring-economy.md`, tests, `data/changelog.json`.
Do NOT touch the pipelines (`volume-bootstrap-loop.js`, `ring-rebalance.js`) —
task 04 owns them.

## Constraints

- Never weaken `validateRingTransaction` or the anti-drain gate.
- Explicit env vars always beat computed defaults — no surprise re-routing for
  existing non-ring x402 users (Base lane untouched).
- No new dependency.

## Acceptance criteria

- [ ] With `X402_SELF_FACILITATOR_ENABLED=true` and no facilitator URL set, a
      Solana settlement resolves to `/api/x402-facilitator` (test proves it).
- [ ] With the flag off, behavior is byte-identical to today (test proves it).
- [ ] `validateRingConfig()` catches all six misconfigurations (tests).
- [ ] `/api/x402-ring` and `/api/x402-status` expose the warnings.
- [ ] `.env.example` no longer contradicts the code.
- [ ] `npm test` green. Changelog entry added.
