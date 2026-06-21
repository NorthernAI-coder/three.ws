# 44 — Launch-readiness review (final gate)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context. **This is the last prompt in the program — the go/no-go gate.**

## Why this matters for $1B

Everything in prompts `01`–`43` is only real if it survives a single, ruthless,
end-to-end review. A platform aiming at $1B cannot launch on vibes: it launches when
every audit is green, the full test suite passes, security review is clean, and the
`/CLAUDE.md` Definition of Done is verifiably true across every surface. This gate exists
to catch the one red that would otherwise become the incident, the chargeback, or the
front-page screenshot. Its job is to **block launch** — not to bless it by default.

## Mission

Run every audit, the full test suite, and a security review across the whole platform;
verify the Definition of Done on every surface; produce a single scorecard; and return a
go/no-go that is **no-go on any red**.

## Map (trust but verify — files move)

- **The coverage map** — prompts [01](../../prompts/production-1b) through
  [43](../../prompts/production-1b) in [prompts/production-1b/](../../prompts/production-1b).
  Each prompt's **Acceptance** section is a checklist this gate re-verifies at a spot-check
  level; treat them as the requirements traceability matrix.
- **Audit scripts** (in [package.json](../../package.json)) — `audit:deploy`,
  `audit:pages`, `audit:handlers`, `audit:web`, `audit:mcp`, `check:images`, `seo:meta`,
  `check:dist`, `check-api-not-bundled` (in [scripts/](../../scripts)).
- **Verify / smoke** — `verify`, `verify:solana`, `verify:onchain`, `verify:ibm`,
  `verify:zauth`, `smoke:onchain`, `smoke:mcp`, `smoke:agent-wallet`, `snapshot`.
- **Tests** — `npm test` (`vitest run && playwright test`), `test:all`, `test:gate`,
  `lint`, `typecheck`; CI at [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
  (jobs: lint, test, guards, typecheck).
- **Definition of Done + operating rules** — [/CLAUDE.md](../../CLAUDE.md).
- **Changelog integrity** — [data/changelog.json](../../data/changelog.json) →
  `npm run build:pages` → [public/changelog.json](../../public/changelog.json),
  [public/changelog.xml](../../public/changelog.xml), [CHANGELOG.md](../../CHANGELOG.md).

## Do this

1. **Run the full audit battery and capture results.** Execute and record pass/fail +
   key output for each: `npm run lint`, `npm run typecheck`, `npm test`, `npm run audit:deploy`,
   `audit:pages`, `audit:handlers`, `audit:web`, `audit:mcp`, `check:images`, `seo:meta`,
   `check:dist`. Do not summarize away failures — every red is a launch blocker until fixed
   or explicitly waived with a stated reason and owner.
2. **Run the on-chain / integration verifiers.** `npm run verify`, `verify:solana`,
   `verify:onchain`, `smoke:onchain`, `smoke:mcp`, `smoke:agent-wallet`. These touch real
   chains/services — record real results, never assume green.
3. **Run a security review** (`/security-review`) over the platform's exposed surface:
   authz, input validation, SSRF, secrets/env hygiene, rate limiting, moderation gates,
   and payment/wallet flows. Cross-check against prompts `05`, `07`, `08`, `31`, `39`.
   Any high/critical finding is an automatic no-go.
4. **Build a clean production artifact.** `npm run build`; then `check:dist` and verify no
   `api/*.js` source got bundle-overwritten (`head -1` for `__defProp`/`createRequire`, per
   `/CLAUDE.md`). A poisoned `api/` diff is a no-go.
5. **Verify the Definition of Done across surfaces.** For each top product surface (Forge,
   Marketplace, Agent Studio, Wallet/x402, Walk/Page-Agent, Scene/Animation Studio,
   Character Studio, Pump/Oracle/$THREE, MCP, SDK, Worlds): spot-check the `/CLAUDE.md` DoD
   — reachable, no console errors, real API calls, every state designed, hover/focus,
   empty/error states, mobile. Note any surface that fails.
6. **Spot-check the Phase 4 growth & compliance prompts (33–43)** specifically: onboarding
   funnel, conversion, pricing, analytics, docs accuracy, virality/attribution, moderation
   gates, legal/privacy + disclaimers, i18n lint, PWA/SW + embed-strip, brand/press. Each
   must meet its own Acceptance; record gaps.
7. **$THREE-only sweep.** Grep the repo (source, copy, fixtures, docs, OG, tests, commit
   messages staged) for any non-`$THREE` coin reference; the contract address must be
   `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` where present. Any other coin is an
   automatic no-go and must be removed.
8. **Changelog + freshness.** Confirm every user-visible change from this program has a
   `data/changelog.json` entry; run `npm run build:pages` and confirm it validates and
   regenerates `CHANGELOG.md` + public changelog feeds cleanly.
9. **Produce the scorecard and verdict.** Emit a single scorecard: one row per area
   (Phase 0–4 + each audit + security + DoD), each marked GREEN / YELLOW / RED with a
   one-line reason and, for non-green, the blocking item and owner. End with an explicit
   **GO** or **NO-GO**. NO-GO if *any* row is RED.

## Must-not

- Do not declare GO with any RED row, any failing audit/test, or any
  high/critical security finding — no exceptions, no "we'll fix it after launch."
- Do not skip a flaky or slow audit/test — re-run it; investigate the cause; record the
  real result. A skipped check is treated as RED.
- Do not mask or summarize away a failure to make the scorecard look green.
- Do not run `npm run changelog:push` as part of the gate (that's post-deploy).
- Do not introduce new features here — this is verification only; fix blockers, don't gold-plate.
- Do not reference any coin other than `$THREE`; flag any that exists as a blocker.

## Acceptance (all true before claiming done — i.e., before a GO)

- [ ] `lint`, `typecheck`, `npm test` (vitest + playwright), and all `audit:*` +
      `check:images` + `seo:meta` + `check:dist` pass; results recorded.
- [ ] All `verify*` and `smoke:*` integration/on-chain checks pass with recorded real output.
- [ ] `/security-review` complete with zero high/critical findings open.
- [ ] Clean production build; no bundle-overwritten `api/*.js`.
- [ ] `/CLAUDE.md` Definition of Done spot-verified on every top product surface.
- [ ] Phase 4 prompts (33–43) each meet their Acceptance; gaps recorded and resolved.
- [ ] $THREE-only sweep clean (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); no other coin.
- [ ] Changelog complete and `npm run build:pages` validates/regenerates cleanly.
- [ ] A scorecard exists (one row per area, GREEN/YELLOW/RED + reason/owner) with an
      explicit **GO / NO-GO** verdict; verdict is **GO only if every row is GREEN**.
