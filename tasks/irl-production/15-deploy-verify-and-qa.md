# Task 15 — Launch gate: deploy verification, real-device QA, console-clean audit

**Phase:** 4 (launch gate) · **Effort:** M · **Run last.** · **Files:** verification + reports only

## Why
This is the gate that proves the whole program actually landed in production. Code
that passes locally but 404s in prod (a known IRL risk — newer `/api/irl/*`
endpoints have 404'd from a stale deploy predating the commit that added them) is
NOT done. This task verifies the deployed reality and the real-device experience.

## Read first
- `tasks/irl-production/README.md` (constraints) and the summaries from tasks 01–14.
- Known deploy traps: memory `vercel-deploy-pipeline`, `vercel-symlink-build-trap`,
  `vercel-build-clobbers-api`, `irl-b2-agent-card` (stale-deploy 404s), and
  `pump-action-shadows-dedicated-files`.

## Scope

1. **Automated gates (run and paste output):**
   - `npm test` — full suite green.
   - `npx esbuild src/irl.js --outfile=/dev/null` and the other changed client modules — clean.
   - `npm run typecheck` — green (per memory `typecheck-ratchet`).
   - `npm run build:pages` — validates the changelog and regenerates artifacts.
   - Confirm no `api/irl/*.js` file was clobbered by an esbuild bundle
     (`head -1` must not be `__defProp`/`createRequire`).

2. **Deployed-endpoint verification.** After deploy, confirm all six endpoints
   respond in production (not 404 from a stale deploy):
   `/api/irl/pins`, `/api/irl/agent-card`, `/api/irl/agent-summary`,
   `/api/irl/interactions`, `/api/irl/interactions-stream`, `/api/irl/report`.
   Verify each has its `vercel.json` function entry AND route, and that the live
   deployment is built from the commit that contains these changes (check the
   deployments API / commit SHA). Document the prod status of each.

3. **Real-device test matrix (manual — document results honestly):**
   - **iOS Safari:** camera permission → Camera AR → Pin here (no GPS, then with
     GPS) → pan: avatar stays anchored, visible only when aimed at → inspect an
     agent → x402 pay path reachable → rotate device → background/foreground.
   - **Android Chrome:** same, plus the WebXR "Place on floor" flow and AR↔XR toggling.
   - Both: 320px layout, keyboard/screen-reader spot check, reduced-motion.

4. **Console-clean audit.** On the live `/irl`, the console must be free of errors and
   of warnings originating from our code. Distinguish real issues from known benign
   noise (memory `console-audit-baseline`: insights 404, HMR WS, GPU-stall, rapier/
   colyseus). Fix anything real; document the rest.

5. **End-to-end smoke.** Place a pin, confirm it persists, appears within range on a
   second device/session, can be inspected, reported, and is reaped on expiry.

## Definition of done
- [ ] All automated gates green (output pasted).
- [ ] All six endpoints verified live in prod against the deploying commit SHA.
- [ ] Real-device matrix exercised; results documented (including anything that
      could not be verified and why).
- [ ] Live console clean of real errors/warnings.
- [ ] A short launch-readiness report: what shipped, what's verified, residual risks.
- [ ] Consolidated changelog reviewed and live.
